jest.mock('../models/BillingSchedule', () => {
    const docs = [];
    const Model = jest.fn(function BillingSchedule(doc) {
        Object.assign(this, doc);
        this.save = jest.fn(async () => this);
        docs.push(this);
    });
    Model.__docs = docs;
    Model.findOne = jest.fn(async (query) => docs.find((doc) => (
        (query.idempotencyKey && doc.idempotencyKey === query.idempotencyKey) ||
        (query.subscriptionId && String(doc.subscriptionId) === String(query.subscriptionId) &&
            doc.chargeType === query.chargeType)
    )) || null);
    Model.findOneAndUpdate = jest.fn(async (filter, update) => {
        let doc = docs.find((row) => row.idempotencyKey === filter.idempotencyKey);
        if (!doc) {
            doc = new Model(update.$setOnInsert);
        }
        return doc;
    });
    return Model;
});
jest.mock('../models/Subscription', () => ({
    findById: jest.fn(),
    tierConfigs: {
        developer: { amount: 0 },
        pro: { amount: 20 },
        pro_plus: { amount: 60 },
        team_standard: { amount: 40 },
        team_premium: { amount: 120 },
        enterprise: { amount: null }
    }
}));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../config/paystack', () => ({
    transaction: { charge: jest.fn(), verify: jest.fn() }
}));
jest.mock('../config/flutterwave', () => ({
    Tokenized: { charge: jest.fn() },
    Transaction: { verify: jest.fn() }
}));

const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const paystack = require('../config/paystack');
const flutterwave = require('../config/flutterwave');
const paystackScheduler = require('../utils/paystackScheduler');
const flutterwaveScheduler = require('../utils/flutterwaveScheduler');

function makeRow(overrides = {}) {
    return {
        _id: 'sched-1',
        subscriptionId: 'sub-1',
        userId: 'user-1',
        chargeType: 'first_charge',
        status: 'processing',
        amount: 2000,
        attempts: 0,
        save: jest.fn(async () => {}),
        ...overrides
    };
}

function subscription(overrides = {}) {
    return {
        _id: 'sub-1',
        userId: 'user-1',
        tier: 'pro',
        paymentId: 'auth-1',
        customerId: 'cust-1',
        save: jest.fn(async () => {}),
        ...overrides
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    BillingSchedule.__docs.length = 0;
    BillingSchedule.findOne.mockResolvedValue(null);
    User.findById.mockResolvedValue({ _id: 'user-1', email: 'user@example.com' });
    Subscription.findById.mockResolvedValue(subscription());
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('scheduler provider metadata', () => {
    test.each([
        ['paystack', () => paystackScheduler],
        ['flutterwave', () => flutterwaveScheduler],
    ])('%s schedules carry the provider', async (provider, getScheduler) => {
        const cardAddedAt = new Date('2026-10-01T00:00:00.000Z');

        const row = await getScheduler().scheduleFirstCharge(
            'user-1',
            'sub-1',
            cardAddedAt,
            'pro'
        );

        expect(row.provider).toBe(provider);
        expect(row.status).toBe('pending');
    });

    test('Paystack sends the deterministic reference the reaper can verify', async () => {
        const row = makeRow();
        paystack.transaction.charge.mockResolvedValue({
            status: true,
            data: { status: 'success', reference: 'bs-sched-1' }
        });

        const result = await paystackScheduler.processCharge(row);

        expect(result.success).toBe(true);
        expect(paystack.transaction.charge).toHaveBeenCalledWith(
            expect.objectContaining({
                reference: 'bs-sched-1',
                metadata: expect.objectContaining({ scheduleId: 'sched-1' })
            })
        );
        expect(row.provider).toBe('paystack');
        expect(row.status).toBe('completed');
        expect(row.paystackReference).toBe('bs-sched-1');
        expect(row.providerStatus).toBe('success');
        expect(row.completedAt).toBeInstanceOf(Date);
        expect(paystack.transaction.charge).not.toHaveBeenCalledWith(
            expect.objectContaining({ reference: expect.stringContaining('bs_') })
        );
    });

    test('Flutterwave sends a traceable tx_ref and stores the transaction id', async () => {
        const row = makeRow();
        flutterwave.Tokenized.charge.mockResolvedValue({
            status: 'success',
            data: { id: 777, status: 'successful' }
        });

        const result = await flutterwaveScheduler.processCharge(row);

        expect(result.success).toBe(true);
        expect(flutterwave.Tokenized.charge).toHaveBeenCalledWith(
            expect.objectContaining({ tx_ref: 'charge_sched-1' })
        );
        expect(row.provider).toBe('flutterwave');
        expect(row.status).toBe('completed');
        expect(row.flutterwaveTransactionId).toBe(777);
        expect(row.providerStatus).toBe('successful');
        expect(row.completedAt).toBeInstanceOf(Date);
    });
});
