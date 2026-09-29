/**
 * Billing transition route tests: cancel, resume, change-plan.
 *
 * The behaviour locked in here is the whole point of the rebuild:
 *   - cancelling a PAID plan keeps entitlements until the period ends;
 *   - cancelling a TRIAL ends it immediately (nothing was paid for);
 *   - downgrades are scheduled for period end, never applied early;
 *   - upgrades are refused here and redirected to checkout, so this endpoint
 *     can never be used to grant a paid tier without payment.
 */

const express = require('express');
const request = require('supertest');

const USER = '507f1f77bcf86cd799439011';
const DAY = 24 * 60 * 60 * 1000;

jest.doMock('../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.userId = req.headers['x-user-id'] || USER;
        req.user = { _id: req.userId, fullName: 'Ada' };
        next();
    },
}));

jest.mock('../server/models/EntitlementModel', () => ({
    findOne: jest.fn(async () => ({ credits: 5, aiMessagesUsedToday: 1 })),
}));
jest.mock('../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../config/stripe', () => ({
    createCheckoutSession: jest.fn(),
    createPortalSession: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    stripe: {},
}));
jest.mock('../utils/paymentRouter', () => ({ createCheckout: jest.fn() }));
jest.mock('../middleware/trial', () => ({
    getOrCreateSubscription: jest.fn(async () => store.doc),
}));

const Subscription = require('../models/Subscription');
const subscriptionRoutes = require('../routes/subscription');
const { getOrCreateSubscription } = require('../middleware/trial');

const app = express();
app.use(express.json());
app.use('/api/subscription', subscriptionRoutes);

// `store.doc` stands in for the document in the database. It is a real model
// instance so `upgradeTo()` — the method under test — behaves for real; only
// the database round trip is stubbed.
const store = { doc: null };

let saveSpy;
beforeAll(() => {
    saveSpy = jest.spyOn(Subscription.prototype, 'save').mockImplementation(async function save() {
        return this;
    });
});
afterAll(() => saveSpy.mockRestore());

function seed(overrides) {
    store.doc = new Subscription({
        userId: USER,
        tier: 'developer',
        status: 'active',
        ...overrides,
    });
    return store.doc;
}

const post = (path, body) =>
    request(app).post(`/api/subscription${path}`).set('x-user-id', USER).send(body || {});

let findOneSpy;
beforeEach(() => {
    jest.clearAllMocks();
    store.doc = null;
    findOneSpy = jest
        .spyOn(Subscription, 'findOne')
        .mockImplementation(async () => store.doc);
    getOrCreateSubscription.mockImplementation(async () => store.doc);
});

describe('GET /current', () => {
    test('returns a derived state alongside the legacy fields', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await request(app).get('/api/subscription/current').set('x-user-id', USER);
        expect(res.status).toBe(200);
        expect(res.body.state).toBeDefined();
        expect(res.body.state.phase).toBe('active');
        expect(res.body.state.tier).toBe('pro');
        // Legacy shape preserved for the auth store and other consumers.
        expect(res.body.subscription.tier).toBe('pro');
        expect(res.body.subscription.status).toBe('active');
    });

    test('exposes a live trial as phase=trial (never "free")', async () => {
        seed({ tier: 'pro', status: 'trial', trialEndsAt: new Date(Date.now() + 5 * DAY) });
        const res = await request(app).get('/api/subscription/current').set('x-user-id', USER);
        expect(res.body.state.phase).toBe('trial');
        expect(res.body.state.isTrialing).toBe(true);
        expect(res.body.state.trialDaysLeft).toBe(5);
        expect(res.body.state.canCancel).toBe(true);
    });

    test('applies a due scheduled change on read', async () => {
        const doc = seed({
            tier: 'pro',
            status: 'active',
            cancelAtPeriodEnd: true,
            changeEffectiveAt: new Date(Date.now() - DAY),
        });
        const res = await request(app).get('/api/subscription/current').set('x-user-id', USER);
        expect(res.body.state.phase).not.toBe('canceling');
        expect(res.body.state.tier).toBe('developer');
        expect(doc.tier).toBe('developer');
    });
});

describe('POST /cancel', () => {
    test('schedules a paid cancellation instead of revoking access', async () => {
        const endDate = new Date(Date.now() + 20 * DAY);
        seed({ tier: 'pro', status: 'active', endDate });

        const res = await post('/cancel');

        expect(res.status).toBe(200);
        expect(res.body.state.phase).toBe('canceling');
        expect(res.body.state.hasPendingChange).toBe(true);
        // The user keeps what they paid for.
        expect(res.body.state.tier).toBe('pro');
        expect(res.body.state.hasEntitlement).toBe(true);
        expect(store.doc.cancelAtPeriodEnd).toBe(true);
        expect(store.doc.changeEffectiveAt).toEqual(endDate);
    });

    test('records cancelledAt, which the model previously dropped', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        await post('/cancel');
        expect(store.doc.cancelledAt).toBeInstanceOf(Date);
    });

    test('ends a trial immediately, because nothing was paid', async () => {
        seed({ tier: 'pro', status: 'trial', trialEndsAt: new Date(Date.now() + 8 * DAY) });
        const res = await post('/cancel');
        expect(res.status).toBe(200);
        expect(res.body.state.cancelIsImmediate).toBe(true);
        expect(res.body.state.tier).toBe('developer');
        expect(res.body.state.status).toBe('cancelled');
        expect(store.doc.cancelAtPeriodEnd).toBeFalsy();
    });

    test('mode=immediate revokes a paid plan right away', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/cancel', { mode: 'immediate' });
        expect(res.body.state.tier).toBe('developer');
        expect(res.body.state.hasPendingChange).toBe(false);
    });

    test('cancelling an already-free plan is harmless', async () => {
        seed({ tier: 'developer', status: 'active' });
        const res = await post('/cancel');
        expect(res.status).toBe(200);
        expect(res.body.state.tier).toBe('developer');
    });

    test('404s when there is no subscription', async () => {
        const res = await post('/cancel');
        expect(res.status).toBe(404);
    });
});

describe('POST /resume', () => {
    test('clears a scheduled cancellation and keeps the plan', async () => {
        const endDate = new Date(Date.now() + 20 * DAY);
        seed({ tier: 'pro', status: 'active', endDate, cancelAtPeriodEnd: true, changeEffectiveAt: endDate });

        const res = await post('/resume');

        expect(res.status).toBe(200);
        expect(res.body.state.phase).toBe('active');
        expect(res.body.state.tier).toBe('pro');
        expect(res.body.state.hasPendingChange).toBe(false);
        expect(store.doc.cancelAtPeriodEnd).toBe(false);
    });

    test('clears a scheduled downgrade', async () => {
        seed({
            tier: 'team_premium',
            status: 'active',
            endDate: new Date(Date.now() + 20 * DAY),
            pendingTier: 'pro',
            changeEffectiveAt: new Date(Date.now() + 20 * DAY),
        });
        const res = await post('/resume');
        expect(res.body.state.pendingTier).toBeNull();
        expect(res.body.state.tier).toBe('team_premium');
    });

    test('reactivates a plan that was cancelled but not yet ended', async () => {
        seed({
            tier: 'pro',
            status: 'cancelled',
            endDate: new Date(Date.now() + 10 * DAY),
            cancelAtPeriodEnd: true,
            changeEffectiveAt: new Date(Date.now() + 10 * DAY),
        });
        const res = await post('/resume');
        expect(res.body.state.status).toBe('active');
    });

    test('is a no-op when nothing is scheduled', async () => {
        seed({ tier: 'pro', status: 'active' });
        const res = await post('/resume');
        expect(res.status).toBe(200);
        expect(res.body.state.tier).toBe('pro');
    });
});

describe('POST /change-plan', () => {
    test('schedules a downgrade for the end of the paid period', async () => {
        const endDate = new Date(Date.now() + 20 * DAY);
        seed({ tier: 'team_premium', status: 'active', endDate });

        const res = await post('/change-plan', { tier: 'pro' });

        expect(res.status).toBe(200);
        expect(res.body.state.phase).toBe('changing');
        expect(res.body.state.pendingTier).toBe('pro');
        // Not applied early — the user keeps Team Premium until they paid period ends.
        expect(res.body.state.tier).toBe('team_premium');
        expect(store.doc.pendingTier).toBe('pro');
        expect(store.doc.changeEffectiveAt).toEqual(endDate);
    });

    test('moving to the free plan is a downgrade and is scheduled', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/change-plan', { tier: 'developer' });
        expect(res.status).toBe(200);
        expect(res.body.state.pendingTier).toBe('developer');
        expect(res.body.state.tier).toBe('pro');
    });

    test('applies instantly for a trialing user, who has paid nothing', async () => {
        seed({ tier: 'pro', status: 'trial', trialEndsAt: new Date(Date.now() + 6 * DAY) });
        const res = await post('/change-plan', { tier: 'developer' });
        expect(res.status).toBe(200);
        expect(res.body.state.tier).toBe('developer');
        expect(res.body.state.hasPendingChange).toBe(false);
    });

    test('honours timing=now for a paid plan', async () => {
        seed({ tier: 'team_premium', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/change-plan', { tier: 'pro', timing: 'now' });
        expect(res.body.state.tier).toBe('pro');
        expect(res.body.state.hasPendingChange).toBe(false);
    });

    // Critical: this endpoint must never grant a paid tier without payment.
    test('refuses upgrades and sends them to checkout', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/change-plan', { tier: 'pro_plus' });
        expect(res.status).toBe(400);
        expect(res.body.requiresCheckout).toBe(true);
        expect(res.body.tier).toBe('pro_plus');
        expect(store.doc.tier).toBe('pro');
    });

    test('refuses enterprise, which is handled by sales', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/change-plan', { tier: 'enterprise' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/sales/i);
    });

    test('rejects a no-op change', async () => {
        seed({ tier: 'pro', status: 'active', endDate: new Date(Date.now() + 20 * DAY) });
        const res = await post('/change-plan', { tier: 'pro' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already/i);
    });

    test('scheduling a replacement plan supersedes a pending cancellation', async () => {
        const endDate = new Date(Date.now() + 20 * DAY);
        seed({ tier: 'pro', status: 'active', endDate, cancelAtPeriodEnd: true, changeEffectiveAt: endDate });
        const res = await post('/change-plan', { tier: 'developer' });
        expect(res.status).toBe(200);
        expect(store.doc.cancelAtPeriodEnd).toBe(false);
        expect(res.body.state.phase).toBe('changing');
    });
});
