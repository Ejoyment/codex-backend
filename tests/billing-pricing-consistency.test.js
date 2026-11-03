/**
 * Trial billing consistency: every card-backed trial waits 14 days before the
 * first charge, and scheduled amounts come from the canonical tier pricing.
 */
const mongoose = require('mongoose');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_pricing';

const BillingSchedule = require('../models/BillingSchedule');
const { planAmount, planAmountCents } = require('../utils/billingPricing');
const flutterwaveScheduler = require('../utils/flutterwaveScheduler');
const paystackScheduler = require('../utils/paystackScheduler');
const stripeScheduler = require('../utils/billingScheduler');

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const USER_ID = new mongoose.Types.ObjectId();

afterEach(() => {
  jest.restoreAllMocks();
});

describe('canonical tier pricing', () => {
  test('matches the published monthly prices', () => {
    expect(planAmount('pro')).toBe(20);
    expect(planAmount('pro_plus')).toBe(60);
    expect(planAmount('team_standard')).toBe(40);
    expect(planAmount('team_premium')).toBe(120);
    expect(planAmount('unknown')).toBe(20);
    expect(planAmountCents('pro')).toBe(2000);
    expect(planAmountCents('team_premium')).toBe(12000);
  });
});

describe.each([
  ['Flutterwave', () => flutterwaveScheduler],
  ['Paystack', () => paystackScheduler],
  ['Stripe', () => stripeScheduler],
])('%s first charge', (_name, getScheduler) => {
  test('is scheduled 14 days out at the canonical plan amount', async () => {
    const scheduler = getScheduler();
    const cardAddedAt = new Date('2026-10-01T00:00:00.000Z');
    jest.spyOn(BillingSchedule, 'findOne').mockResolvedValue(null);
    const inserted = [];
    jest.spyOn(BillingSchedule, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
      const document = { ...update.$setOnInsert, _id: new mongoose.Types.ObjectId() };
      inserted.push({ filter, document });
      return document;
    });

    const schedule = await scheduler.scheduleFirstCharge(
      USER_ID,
      new mongoose.Types.ObjectId(),
      cardAddedAt,
      'team_premium'
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0].filter).toEqual({ idempotencyKey: `first_charge:${schedule.subscriptionId}` });
    expect(schedule.idempotencyKey).toBe(`first_charge:${schedule.subscriptionId}`);
    expect(schedule.amount).toBe(12000);
    expect(schedule.scheduledFor.getTime() - cardAddedAt.getTime()).toBe(FOURTEEN_DAYS_MS);
  });

  test('reuses an existing first charge even after completion', async () => {
    const scheduler = getScheduler();
    const existing = { _id: 'existing', status: 'completed' };
    jest.spyOn(BillingSchedule, 'findOne').mockResolvedValue(existing);
    const save = jest.spyOn(BillingSchedule.prototype, 'save');

    const result = await scheduler.scheduleFirstCharge(
      'user-1',
      new mongoose.Types.ObjectId(),
      new Date(),
      'pro'
    );

    expect(result).toBe(existing);
    expect(save).not.toHaveBeenCalled();
  });
});
