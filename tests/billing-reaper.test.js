jest.mock('stripe', () => {
    const paymentIntents = {
        create: jest.fn(),
        retrieve: jest.fn(),
        search: jest.fn()
    };
    const client = { paymentIntents };
    const StripeMock = jest.fn(() => client);
    StripeMock.__client = client;
    return StripeMock;
});

jest.mock('../models/BillingSchedule', () => ({ find: jest.fn() }));

const BillingSchedule = require('../models/BillingSchedule');
const BillingScheduler = require('../utils/billingScheduler');
const stripeFactory = require('stripe');

const paymentIntents = stripeFactory.__client.paymentIntents;

function makeRow(overrides = {}) {
    return {
        _id: 'sched-1',
        chargeType: 'first_charge',
        status: 'processing',
        save: jest.fn(async () => {}),
        ...overrides
    };
}

let limitMock;

beforeEach(() => {
    jest.clearAllMocks();
    limitMock = jest.fn().mockResolvedValue([]);
    BillingSchedule.find.mockReturnValue({ limit: limitMock });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('reapStuckCharges scan', () => {
    test('only picks up processing rows older than the stuck threshold', async () => {
        const before = Date.now();
        await BillingScheduler.reapStuckCharges();

        const filter = BillingSchedule.find.mock.calls[0][0];
        expect(filter.status).toBe('processing');
        const cutoff = filter.lastAttempt.$lt.getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        expect(cutoff).toBeGreaterThanOrEqual(before - thirtyMinutes - 5000);
        expect(cutoff).toBeLessThanOrEqual(Date.now() - thirtyMinutes + 5000);
        expect(limitMock).toHaveBeenCalledWith(100);
    });

    test('hands nothing to reconcile when no rows are stuck', async () => {
        const summary = await BillingScheduler.reapStuckCharges();

        expect(summary).toEqual({ scanned: 0, completed: 0, failed: 0, pending: 0 });
        expect(paymentIntents.retrieve).not.toHaveBeenCalled();
        expect(paymentIntents.search).not.toHaveBeenCalled();
    });
});

describe('reconciling against the stored PaymentIntent', () => {
    test('marks a succeeded intent as completed without re-charging', async () => {
        const row = makeRow({ stripePaymentIntentId: 'pi_123' });
        limitMock.mockResolvedValue([row]);
        paymentIntents.retrieve.mockResolvedValue({ id: 'pi_123', status: 'succeeded' });

        const summary = await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('completed');
        expect(row.completedAt).toBeInstanceOf(Date);
        expect(row.save).toHaveBeenCalled();
        expect(summary).toMatchObject({ scanned: 1, completed: 1, failed: 0 });
        expect(paymentIntents.search).not.toHaveBeenCalled();
    });

    test('leaves the row alone while the intent is still pending', async () => {
        const row = makeRow({ stripePaymentIntentId: 'pi_123' });
        limitMock.mockResolvedValue([row]);
        paymentIntents.retrieve.mockResolvedValue({ id: 'pi_123', status: 'processing' });

        const summary = await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('processing');
        expect(row.save).not.toHaveBeenCalled();
        expect(summary.pending).toBe(1);
    });

    test('fails the row when the intent definitively did not succeed', async () => {
        const row = makeRow({ stripePaymentIntentId: 'pi_123' });
        limitMock.mockResolvedValue([row]);
        paymentIntents.retrieve.mockResolvedValue({ id: 'pi_123', status: 'canceled' });

        const summary = await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('failed');
        expect(row.error).toContain('canceled');
        expect(summary.failed).toBe(1);
    });

    test('leaves the row for the next sweep when Stripe is unreachable', async () => {
        const row = makeRow({ stripePaymentIntentId: 'pi_123' });
        limitMock.mockResolvedValue([row]);
        paymentIntents.retrieve.mockRejectedValue(new Error('ECONNRESET'));

        const summary = await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('processing');
        expect(row.save).not.toHaveBeenCalled();
        expect(summary.pending).toBe(1);
    });
});

describe('reconciling via metadata search (crash before the id was saved)', () => {
    test('finds a succeeded intent by scheduleId and completes the row', async () => {
        const row = makeRow();
        limitMock.mockResolvedValue([row]);
        paymentIntents.search.mockResolvedValue({
            data: [{ id: 'pi_search', status: 'succeeded' }]
        });

        const summary = await BillingScheduler.reapStuckCharges();

        expect(paymentIntents.search).toHaveBeenCalledWith({
            query: "metadata['scheduleId']:'sched-1'",
            limit: 1
        });
        expect(row.status).toBe('completed');
        expect(row.stripePaymentIntentId).toBe('pi_search');
        expect(summary.completed).toBe(1);
        expect(paymentIntents.create).not.toHaveBeenCalled();
    });

    test('fails the row with a review note when no charge is found', async () => {
        const row = makeRow();
        limitMock.mockResolvedValue([row]);
        paymentIntents.search.mockResolvedValue({ data: [] });

        const summary = await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('failed');
        expect(row.error).toContain('no successful charge confirmed');
        expect(summary.failed).toBe(1);
        expect(paymentIntents.create).not.toHaveBeenCalled();
    });

    test('fails with a review note when search is unavailable', async () => {
        const row = makeRow();
        limitMock.mockResolvedValue([row]);
        paymentIntents.search.mockRejectedValue(new Error('search not supported'));

        await BillingScheduler.reapStuckCharges();

        expect(row.status).toBe('failed');
        expect(row.error).toContain('no successful charge confirmed');
    });
});
