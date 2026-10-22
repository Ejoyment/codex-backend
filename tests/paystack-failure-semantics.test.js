/**
 * A failed Paystack charge must not cancel the subscription or drop the paid
 * tier. It enters `past_due` so a retry or card update can recover it, matching
 * Flutterwave. Only cancellation downgrades.
 */
jest.mock('../config/paystack', () => ({
  transaction: { charge: jest.fn() },
  customer: { create: jest.fn() },
}));

const paystack = require('../config/paystack');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const PaystackScheduler = require('../utils/paystackScheduler');

afterEach(() => {
  jest.restoreAllMocks();
});

test('failed charge marks the subscription past_due without downgrading', async () => {
  const subscription = {
    status: 'active',
    tier: 'pro',
    userId: 'user-1',
    paymentId: 'auth-1',
    upgradeTo: jest.fn(),
    save: jest.fn(async function save() { return this; }),
  };
  jest.spyOn(Subscription, 'findById').mockResolvedValue(subscription);
  jest.spyOn(User, 'findById').mockResolvedValue({ email: 'a@b.c' });
  paystack.transaction.charge.mockRejectedValue(new Error('card declined'));

  const schedule = {
    _id: 'schedule-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    chargeType: 'first_charge',
    amount: 2000,
    attempts: 0,
    status: 'pending',
    save: jest.fn(async function save() { return this; }),
  };

  const result = await PaystackScheduler.processCharge(schedule);

  expect(result.success).toBe(false);
  expect(schedule.status).toBe('failed');
  expect(schedule.attempts).toBe(1);
  expect(subscription.status).toBe('past_due');
  expect(subscription.tier).toBe('pro');
  expect(subscription.upgradeTo).not.toHaveBeenCalled();
  expect(subscription.cancelledAt).toBeUndefined();
});
