/**
 * Manual enterprise provisioning (admin-only) — amount is stored in minor
 * units and signed over identity/plan/provider/status/currency/period end.
 * Consumer plan-price validation must never run on this path.
 */
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-admin-enterprise-tests-32chars';
process.env.ENTITLEMENT_SIGNING_SECRET = 'test-entitlement-signing-secret';
process.env.ADMIN_API_KEY = 'test-admin-key';

jest.mock('../server/services/billing/paymentValidation', () => ({
    validateActivationPayment: jest.fn(() => {
        throw new Error('manual provisioning must not run consumer price validation');
    }),
}));

jest.mock('../utils/adminAudit', () => ({
    recordAdminAction: jest.fn(async () => null),
}));

const Entitlement = require('../server/models/EntitlementModel');
const Subscription = require('../models/Subscription');
const paymentValidation = require('../server/services/billing/paymentValidation');
const entitlementService = require('../server/services/billing/entitlementService');
const { verifyEntitlementSignature } = require('../server/services/billing/entitlementSignature');
const { recordAdminAction } = require('../utils/adminAudit');

const USER = '507f1f77bcf86cd799439011';
const OTHER_USER = '507f1f77bcf86cd799439012';
const ADMIN_KEY = process.env.ADMIN_API_KEY;

const store = new Map();

function makeDoc(overrides = {}) {
    return {
        userId: USER,
        teamId: null,
        plan: 'developer',
        status: 'active',
        provider: 'stripe',
        currency: 'USD',
        currentPeriodEnd: null,
        amountMinor: null,
        entitlementSignature: null,
        cancelAtPeriodEnd: false,
        providerSubscriptionId: null,
        providerCustomerId: null,
        isActive() {
            return this.status === 'active' || this.status === 'trial';
        },
        async save() {
            store.set(String(this.userId), this);
            return this;
        },
        ...overrides,
    };
}

function seed(overrides = {}) {
    const doc = makeDoc(overrides);
    store.set(String(doc.userId), doc);
    return doc;
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin'));
    return app;
}

const provision = (body, userId = USER, key = ADMIN_KEY) => {
    const req = request(makeApp()).post(`/api/admin/entitlements/${userId}/enterprise`);
    if (key !== null) req.set('x-admin-key', key);
    return req.send(body || {});
};

const read = (userId = USER, key = ADMIN_KEY) => {
    const req = request(makeApp()).get(`/api/admin/entitlements/${userId}`);
    if (key !== null) req.set('x-admin-key', key);
    return req;
};

beforeEach(() => {
    store.clear();
    jest.restoreAllMocks();
    paymentValidation.validateActivationPayment.mockClear();
    recordAdminAction.mockClear();
    jest.spyOn(Entitlement, 'findOne').mockImplementation(async (filter) => {
        return store.get(String(filter.userId)) || null;
    });
    jest.spyOn(Entitlement, 'create').mockImplementation(async (input) => {
        return seed({ userId: input.userId });
    });
    jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('POST /api/admin/entitlements/:userId/enterprise', () => {
    test('provisions enterprise with provider manual and a verifiable amount signature', async () => {
        const res = await provision({
            amountMinor: 123456789,
            currency: 'usd',
            currentPeriodEnd: '2027-10-24T00:00:00.000Z',
            status: 'active',
            plan: 'pro',
            provider: 'stripe',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            userId: USER,
            plan: 'enterprise',
            status: 'active',
            provider: 'manual',
            currency: 'USD',
            amountMinor: 123456789,
            cancelAtPeriodEnd: false,
            manual: true,
            active: true,
            signatureVerified: true,
        });
        expect(res.body.data.entitlementSignature).toBeUndefined();
        expect(res.body.data.currentPeriodEnd).toBe('2027-10-24T00:00:00.000Z');

        const doc = store.get(USER);
        expect(doc.plan).toBe('enterprise');
        expect(doc.provider).toBe('manual');
        expect(doc.currency).toBe('USD');
        expect(doc.amountMinor).toBe(123456789);
        expect(doc.entitlementSignature).toMatch(/^v1=[0-9a-f]{64}$/);
        expect(verifyEntitlementSignature(doc)).toBe(true);
        expect(paymentValidation.validateActivationPayment).not.toHaveBeenCalled();
        expect(recordAdminAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'entitlement.enterprise.provision',
            target: USER,
            details: expect.objectContaining({ amountMinor: 123456789, currency: 'USD' }),
        }));

        expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: USER },
            expect.objectContaining({
                tier: 'enterprise',
                status: 'active',
                paymentProvider: 'manual',
                endDate: new Date('2027-10-24T00:00:00.000Z'),
                cancelAtPeriodEnd: false,
            }),
            expect.objectContaining({ upsert: true, new: true })
        );
    });

    test('renewal updates the amount and period and rotates the signature', async () => {
        await provision({
            amountMinor: 100000,
            currency: 'USD',
            currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        });
        const first = store.get(USER);
        const firstSignature = first.entitlementSignature;

        const res = await provision({
            amountMinor: 250000,
            currency: 'USD',
            currentPeriodEnd: '2027-12-31T00:00:00.000Z',
            status: 'past_due',
        });

        expect(res.status).toBe(200);
        expect(store.size).toBe(1);
        expect(first.amountMinor).toBe(250000);
        expect(first.status).toBe('past_due');
        expect(first.currentPeriodEnd).toEqual(new Date('2027-12-31T00:00:00.000Z'));
        expect(first.entitlementSignature).not.toBe(firstSignature);
        expect(verifyEntitlementSignature(first)).toBe(true);
        expect(res.body.data.signatureVerified).toBe(true);
    });

    test('fails closed without the admin key', async () => {
        const res = await provision(
            { amountMinor: 100000, currency: 'USD', currentPeriodEnd: '2027-01-01T00:00:00.000Z' },
            USER,
            null
        );
        expect(res.status).toBe(403);
        expect(store.size).toBe(0);
    });

    test('rejects a wrong admin key', async () => {
        const res = await provision(
            { amountMinor: 100000, currency: 'USD', currentPeriodEnd: '2027-01-01T00:00:00.000Z' },
            USER,
            'wrong-key'
        );
        expect(res.status).toBe(403);
        expect(store.size).toBe(0);
    });

    test('rejects malformed amount, currency, period, status, and user id', async () => {
        const valid = {
            amountMinor: 100000,
            currency: 'USD',
            currentPeriodEnd: '2027-01-01T00:00:00.000Z',
            status: 'active',
        };
        const cases = [
            { ...valid, amountMinor: undefined },
            { ...valid, amountMinor: '100000' },
            { ...valid, amountMinor: -1 },
            { ...valid, amountMinor: 1.5 },
            { ...valid, amountMinor: 9007199254740992 },
            { ...valid, currency: 'US' },
            { ...valid, currentPeriodEnd: 'not-a-date' },
            { ...valid, status: 'paused' },
        ];

        for (const body of cases) {
            const res = await provision(body);
            expect(res.status).toBe(400);
        }

        const badId = await provision(valid, 'not-an-object-id');
        expect(badId.status).toBe(400);
        expect(store.size).toBe(0);
    });

    test('falls back to JWT_SECRET when no dedicated signing secret is set', async () => {
        const dedicated = process.env.ENTITLEMENT_SIGNING_SECRET;
        delete process.env.ENTITLEMENT_SIGNING_SECRET;
        try {
            const res = await provision({
                amountMinor: 100000,
                currency: 'USD',
                currentPeriodEnd: '2027-01-01T00:00:00.000Z',
            });
            expect(res.status).toBe(200);
            expect(res.body.data.signatureVerified).toBe(true);
            expect(verifyEntitlementSignature(store.get(USER))).toBe(true);
        } finally {
            if (dedicated === undefined) delete process.env.ENTITLEMENT_SIGNING_SECRET;
            else process.env.ENTITLEMENT_SIGNING_SECRET = dedicated;
        }
    });

    test('keeps old signatures verifiable during signing-key rotation', async () => {
        const primary = process.env.ENTITLEMENT_SIGNING_SECRET;
        const previous = process.env.ENTITLEMENT_SIGNING_SECRET_PREVIOUS;
        try {
            await provision({
                amountMinor: 100000,
                currency: 'USD',
                currentPeriodEnd: '2027-01-01T00:00:00.000Z',
            });
            const oldSignature = store.get(USER).entitlementSignature;

            process.env.ENTITLEMENT_SIGNING_SECRET = 'rotated-primary-secret';
            process.env.ENTITLEMENT_SIGNING_SECRET_PREVIOUS = primary;
            expect(verifyEntitlementSignature(store.get(USER))).toBe(true);

            const res = await provision({
                amountMinor: 200000,
                currency: 'USD',
                currentPeriodEnd: '2027-02-01T00:00:00.000Z',
            });
            expect(res.status).toBe(200);
            expect(store.get(USER).entitlementSignature).not.toBe(oldSignature);
            expect(verifyEntitlementSignature(store.get(USER))).toBe(true);
        } finally {
            if (primary === undefined) delete process.env.ENTITLEMENT_SIGNING_SECRET;
            else process.env.ENTITLEMENT_SIGNING_SECRET = primary;
            if (previous === undefined) delete process.env.ENTITLEMENT_SIGNING_SECRET_PREVIOUS;
            else process.env.ENTITLEMENT_SIGNING_SECRET_PREVIOUS = previous;
        }
    });

    test('does not persist when the signing secret is unavailable', async () => {
        const dedicated = process.env.ENTITLEMENT_SIGNING_SECRET;
        const fallback = process.env.JWT_SECRET;
        delete process.env.ENTITLEMENT_SIGNING_SECRET;
        delete process.env.JWT_SECRET;
        try {
            const res = await provision({
                amountMinor: 100000,
                currency: 'USD',
                currentPeriodEnd: '2027-01-01T00:00:00.000Z',
            });
            expect(res.status).toBe(500);
            expect(store.size).toBe(0);
        } finally {
            if (dedicated === undefined) delete process.env.ENTITLEMENT_SIGNING_SECRET;
            else process.env.ENTITLEMENT_SIGNING_SECRET = dedicated;
            if (fallback === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = fallback;
        }
    });
});

describe('GET /api/admin/entitlements/:userId', () => {
    test('exposes the amount and signature validity without returning the signature', async () => {
        await provision({
            amountMinor: 500000,
            currency: 'EUR',
            currentPeriodEnd: '2027-06-30T00:00:00.000Z',
        });

        const res = await read(USER);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            plan: 'enterprise',
            provider: 'manual',
            currency: 'EUR',
            amountMinor: 500000,
            signatureVerified: true,
        });
        expect(res.body.data.entitlementSignature).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(store.get(USER).entitlementSignature);
    });

    test('detects a tampered stored amount', async () => {
        await provision({
            amountMinor: 500000,
            currency: 'USD',
            currentPeriodEnd: '2027-06-30T00:00:00.000Z',
        });
        store.get(USER).amountMinor = 1;

        const res = await read(USER);
        expect(res.status).toBe(200);
        expect(res.body.data.amountMinor).toBe(1);
        expect(res.body.data.signatureVerified).toBe(false);
    });

    test('detects a tampered status or period end', async () => {
        await provision({
            amountMinor: 500000,
            currency: 'USD',
            currentPeriodEnd: '2027-06-30T00:00:00.000Z',
        });
        const doc = store.get(USER);
        expect(verifyEntitlementSignature({ ...doc, status: 'cancelled' })).toBe(false);
        expect(verifyEntitlementSignature({ ...doc, currentPeriodEnd: new Date('2028-01-01T00:00:00.000Z') })).toBe(false);
    });

    test('returns 404 when no entitlement exists and 403 without the admin key', async () => {
        expect((await read(OTHER_USER)).status).toBe(404);
        expect((await read(USER, null)).status).toBe(403);
    });

    test('manual cancellation re-signs the updated status', async () => {
        await provision({
            amountMinor: 500000,
            currency: 'USD',
            currentPeriodEnd: '2027-06-30T00:00:00.000Z',
        });

        const cancelled = await entitlementService.markCancelled(USER, { atPeriodEnd: false });
        expect(cancelled.status).toBe('cancelled');
        expect(verifyEntitlementSignature(cancelled)).toBe(true);
    });
});
