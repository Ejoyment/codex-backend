/**
 * Flutterwave must be driven by the billing cron the same way Paystack is:
 * without this pass, schedules created by /verify and /webhook never fire and
 * subscriptions stay on `trial` forever.
 */
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ destroy: jest.fn() })) }));
jest.mock('../utils/paystackScheduler', () => ({
  processScheduledCharges: jest.fn(async () => ({ processed: 0 })),
}));
jest.mock('../utils/billingScheduler', () => ({
  processDueCharges: jest.fn(async () => []),
}));
jest.mock('../utils/flutterwaveScheduler', () => ({
  processScheduledCharges: jest.fn(async () => ({ processed: 2 })),
}));

const BillingCron = require('../utils/billingCron');
const FlutterwaveScheduler = require('../utils/flutterwaveScheduler');

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  jest.clearAllMocks();
});

describe('BillingCron — Flutterwave pass', () => {
  test('processNow includes Flutterwave when configured', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const results = await BillingCron.processNow();
    expect(FlutterwaveScheduler.processScheduledCharges).toHaveBeenCalled();
    expect(results.find((r) => r.provider === 'flutterwave')).toMatchObject({
      provider: 'flutterwave',
      processed: 2,
    });
  });

  test('processNow skips Flutterwave when unconfigured', async () => {
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    const results = await BillingCron.processNow();
    expect(FlutterwaveScheduler.processScheduledCharges).not.toHaveBeenCalled();
    expect(results.find((r) => r.provider === 'flutterwave')).toBeUndefined();
  });
});
