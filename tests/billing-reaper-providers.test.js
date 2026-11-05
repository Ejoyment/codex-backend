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
jest.mock('../models/Subscription', () => ({ findById: jest.fn() }));
jest.mock('../config/paystack', () => ({
    transaction: { verify: jest.fn(), charge: jest.fn() }
}));
jest.mock('../config/flutterwave', () => ({
    Transaction: { verify: jest.fn() },
    Tokenized: { charge: jest.fn() }
}));

const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const BillingScheduler = require('../utils/billingScheduler');
const paystack = require('../config/paystack');
const flutterwave = require('../config/flutterwave');
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

function httpError(status, message = 'Request failed') {
    const error = new Error(message);
    error.response = { status };
    return error;
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

async function reap(row) {
    limitMock.mockResolvedValue([row]);
    return BillingScheduler.reapStuckCharges();
}

describe('Paystack reconciliation', () => {
    test('completes a succeeded charge from the stored reference without re-charging', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
        paystack.transaction.verify.mockResolvedValue({
            status: true,
            data: { status: 'success', reference: 'ps_ref_1' }
        });

        const summary = await reap(row);

        expect(paystack.transaction.verify).toHaveBeenCalledWith({ reference: 'ps_ref_1' });
        expect(row.status).toBe('completed');
        expect(row.provider).toBe('paystack');
        expect(row.providerStatus).toBe('success');
        expect(row.paystackReference).toBe('ps_ref_1');
        expect(row.reconciledAt).toBeInstanceOf(Date);
        expect(summary).toEqual({ scanned: 1, completed: 1, failed: 0, pending: 0 });
        expect(paystack.transaction.charge).not.toHaveBeenCalled();
        expect(paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    test('uses the deterministic reference when a crash lost the saved one', async () => {
        const row = makeRow({ provider: 'paystack' });
        paystack.transaction.verify.mockResolvedValue({
            status: true,
            data: { status: 'success', reference: 'bs-sched-1' }
        });

        const summary = await reap(row);

        expect(paystack.transaction.verify).toHaveBeenCalledWith({ reference: 'bs-sched-1' });
        expect(row.status).toBe('completed');
        expect(row.paystackReference).toBe('bs-sched-1');
        expect(summary.completed).toBe(1);
        expect(paystack.transaction.charge).not.toHaveBeenCalled();
    });

    test.each(['pending', 'ongoing', 'processing', 'queued'])(
        'leaves the row processing while Paystack reports %s',
        async (status) => {
            const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
            paystack.transaction.verify.mockResolvedValue({
                status: true,
                data: { status, reference: 'ps_ref_1' }
            });

            const summary = await reap(row);

            expect(row.status).toBe('processing');
            expect(row.save).not.toHaveBeenCalled();
            expect(summary.pending).toBe(1);
        }
    );

    test('fails the row with Paystack-specific text when the charge failed', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
        paystack.transaction.verify.mockResolvedValue({
            status: true,
            data: { status: 'failed', reference: 'ps_ref_1' }
        });

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('Paystack transaction ps_ref_1 is failed');
        expect(row.providerStatus).toBe('failed');
        expect(summary.failed).toBe(1);
    });

    test('fails for manual review when Paystack returns no transaction status', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
        paystack.transaction.verify.mockResolvedValue({
            status: false,
            message: 'Transaction not found',
            data: {}
        });

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('no transaction status');
        expect(row.error).toContain('Transaction not found');
        expect(summary.failed).toBe(1);
    });

    test('treats a 404 from verify as non-retryable and keeps it visible', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_missing' });
        paystack.transaction.verify.mockRejectedValue(httpError(404, 'Transaction not found'));

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('Paystack could not verify reference ps_missing');
        expect(summary.failed).toBe(1);
    });

    test('leaves the row processing on a transient Paystack outage', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
        paystack.transaction.verify.mockRejectedValue(new Error('ECONNRESET'));

        const summary = await reap(row);

        expect(row.status).toBe('processing');
        expect(row.save).not.toHaveBeenCalled();
        expect(summary.pending).toBe(1);
    });

    test('fails for manual review when Paystack is not configured', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1' });
        paystack.transaction.verify.mockRejectedValue(
            new Error('Paystack not configured. Please set PAYSTACK_SECRET_KEY environment variable.')
        );

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('Paystack could not verify reference ps_ref_1');
        expect(summary.failed).toBe(1);
    });
});

describe('Flutterwave reconciliation', () => {
    test('completes a successful transaction from the stored id', async () => {
        const row = makeRow({ provider: 'flutterwave', flutterwaveTransactionId: '12345' });
        flutterwave.Transaction.verify.mockResolvedValue({
            status: 'success',
            data: { id: 12345, status: 'successful' }
        });

        const summary = await reap(row);

        expect(flutterwave.Transaction.verify).toHaveBeenCalledWith({ id: '12345' });
        expect(row.status).toBe('completed');
        expect(row.provider).toBe('flutterwave');
        expect(row.providerStatus).toBe('successful');
        expect(row.flutterwaveTransactionId).toBe('12345');
        expect(row.reconciledAt).toBeInstanceOf(Date);
        expect(summary.completed).toBe(1);
        expect(flutterwave.Tokenized.charge).not.toHaveBeenCalled();
        expect(paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    test.each(['pending', 'processing', 'new', 'ongoing', 'queued'])(
        'leaves the row processing while Flutterwave reports %s',
        async (status) => {
            const row = makeRow({ provider: 'flutterwave', flutterwaveTransactionId: '12345' });
            flutterwave.Transaction.verify.mockResolvedValue({
                status: 'success',
                data: { id: 12345, status }
            });

            const summary = await reap(row);

            expect(row.status).toBe('processing');
            expect(row.save).not.toHaveBeenCalled();
            expect(summary.pending).toBe(1);
        }
    );

    test('fails the row with Flutterwave-specific text when the charge failed', async () => {
        const row = makeRow({ provider: 'flutterwave', flutterwaveTransactionId: '12345' });
        flutterwave.Transaction.verify.mockResolvedValue({
            status: 'success',
            data: { id: 12345, status: 'failed' }
        });

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('Flutterwave transaction 12345 is failed');
        expect(row.providerStatus).toBe('failed');
        expect(summary.failed).toBe(1);
    });

    test('fails for manual review when the transaction id was never persisted', async () => {
        const row = makeRow({ provider: 'flutterwave' });

        const summary = await reap(row);

        expect(flutterwave.Transaction.verify).not.toHaveBeenCalled();
        expect(row.status).toBe('failed');
        expect(row.error).toContain('transaction id was not persisted');
        expect(row.error).toContain('tx_ref charge_sched-1');
        expect(summary.failed).toBe(1);
        expect(flutterwave.Tokenized.charge).not.toHaveBeenCalled();
    });

    test('treats a 404 from verify as non-retryable and keeps it visible', async () => {
        const row = makeRow({ provider: 'flutterwave', flutterwaveTransactionId: '999' });
        flutterwave.Transaction.verify.mockRejectedValue(httpError(404, 'Transaction not found'));

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('Flutterwave could not verify transaction 999');
        expect(summary.failed).toBe(1);
    });

    test('leaves the row processing on a transient Flutterwave outage', async () => {
        const row = makeRow({ provider: 'flutterwave', flutterwaveTransactionId: '12345' });
        flutterwave.Transaction.verify.mockRejectedValue(new Error('ETIMEDOUT'));

        const summary = await reap(row);

        expect(row.status).toBe('processing');
        expect(row.save).not.toHaveBeenCalled();
        expect(summary.pending).toBe(1);
    });
});

describe('provider routing and idempotency', () => {
    test('legacy rows are routed by their stored reference', async () => {
        const row = makeRow({ paystackReference: 'legacy_ref' });
        paystack.transaction.verify.mockResolvedValue({
            status: true,
            data: { status: 'success', reference: 'legacy_ref' }
        });

        const summary = await reap(row);

        expect(paystack.transaction.verify).toHaveBeenCalledWith({ reference: 'legacy_ref' });
        expect(row.status).toBe('completed');
        expect(summary.completed).toBe(1);
        expect(paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    test('routes pre-provider rows via their subscription paymentProvider', async () => {
        const row = makeRow({ subscriptionId: 'sub-legacy' });
        Subscription.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ paymentProvider: 'paystack' })
        });
        paystack.transaction.verify.mockResolvedValue({
            status: true,
            data: { status: 'success', reference: 'bs-sched-1' }
        });

        const summary = await reap(row);

        expect(Subscription.findById).toHaveBeenCalledWith('sub-legacy');
        expect(paystack.transaction.verify).toHaveBeenCalledWith({ reference: 'bs-sched-1' });
        expect(row.status).toBe('completed');
        expect(row.provider).toBe('paystack');
        expect(summary.completed).toBe(1);
        expect(paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    test('falls back to Stripe when the subscription lookup fails', async () => {
        const row = makeRow({ subscriptionId: 'sub-legacy' });
        Subscription.findById.mockImplementation(() => {
            throw new Error('Mongo unavailable');
        });
        paymentIntents.search.mockResolvedValue({ data: [] });

        const summary = await reap(row);

        expect(row.status).toBe('failed');
        expect(row.error).toContain('no successful charge confirmed');
        expect(summary.failed).toBe(1);
    });

    test('Stripe rows still use PaymentIntent reconciliation only', async () => {
        const row = makeRow({ provider: 'stripe', stripePaymentIntentId: 'pi_123' });
        paymentIntents.retrieve.mockResolvedValue({ id: 'pi_123', status: 'succeeded' });

        const summary = await reap(row);

        expect(paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
        expect(row.status).toBe('completed');
        expect(row.provider).toBe('stripe');
        expect(summary.completed).toBe(1);
        expect(paystack.transaction.verify).not.toHaveBeenCalled();
        expect(flutterwave.Transaction.verify).not.toHaveBeenCalled();
    });

    test('a terminal row loaded by a stale scan is not reconciled again', async () => {
        const row = makeRow({ provider: 'paystack', paystackReference: 'ps_ref_1', status: 'completed' });

        const outcome = await BillingScheduler.reconcileStuckCharge(row);

        expect(outcome).toBe('completed');
        expect(paystack.transaction.verify).not.toHaveBeenCalled();
        expect(row.save).not.toHaveBeenCalled();
    });
});
