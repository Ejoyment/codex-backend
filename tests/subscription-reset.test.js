const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const NEXT_MONTH = new Date(2026, 11, 1);

function makeSubscription(overrides = {}) {
  const sub = new Subscription({
    userId: new mongoose.Types.ObjectId(),
    creditPool: { usedThisMonth: 42, resetAt: NEXT_MONTH, ...overrides.creditPool },
    cloudComputeHours: {
      usedThisMonth: 3,
      overageHoursThisMonth: 1.5,
      overageAmountMinor: 250,
      ...overrides.cloudComputeHours,
    },
  });
  return sub;
}

describe('monthly credit reset boundaries', () => {
  test('the default resetAt is the first of next month, not Jan 1', () => {
    const sub = new Subscription({ userId: new mongoose.Types.ObjectId() });
    const resetAt = sub.creditPool.resetAt;

    expect(resetAt.getDate()).toBe(1);
    const expected = new Date();
    expected.setDate(1);
    expected.setMonth(expected.getMonth() + 1);
    expect(resetAt.getMonth()).toBe(expected.getMonth());
    expect(resetAt.getFullYear()).toBe(expected.getFullYear());
  });

  test('resets when the stored boundary is overdue', () => {
    const sub = makeSubscription({ creditPool: { resetAt: new Date(2026, 9, 1) } });

    sub.applyMonthlyReset(NOW);

    expect(sub.creditPool.usedThisMonth).toBe(0);
    expect(sub.cloudComputeHours.usedThisMonth).toBe(0);
    expect(sub.cloudComputeHours.overageHoursThisMonth).toBe(0);
    expect(sub.cloudComputeHours.overageAmountMinor).toBe(0);
    expect(sub.creditPool.resetAt).toEqual(NEXT_MONTH);
  });

  test('normalizes legacy resetAt values that point to a future year', () => {
    const sub = makeSubscription({ creditPool: { resetAt: new Date(2027, 0, 1) } });

    sub.applyMonthlyReset(NOW);

    expect(sub.creditPool.usedThisMonth).toBe(0);
    expect(sub.creditPool.resetAt).toEqual(NEXT_MONTH);
  });

  test('normalizes a missing resetAt', () => {
    const sub = makeSubscription();
    sub.creditPool.resetAt = undefined;

    sub.applyMonthlyReset(NOW);

    expect(sub.creditPool.usedThisMonth).toBe(0);
    expect(sub.creditPool.resetAt).toEqual(NEXT_MONTH);
  });

  test('preserves usage when the boundary is already the next month', () => {
    const sub = makeSubscription();

    sub.applyMonthlyReset(NOW);

    expect(sub.creditPool.usedThisMonth).toBe(42);
    expect(sub.cloudComputeHours.usedThisMonth).toBe(3);
    expect(sub.creditPool.resetAt).toEqual(NEXT_MONTH);
  });
});
