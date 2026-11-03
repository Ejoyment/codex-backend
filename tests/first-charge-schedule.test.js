jest.mock('../models/BillingSchedule', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const BillingSchedule = require('../models/BillingSchedule');
const { scheduleFirstCharge } = require('../utils/firstChargeSchedule');

beforeEach(() => {
  jest.clearAllMocks();
  BillingSchedule.findOne.mockResolvedValue(null);
});

test('concurrent first-charge requests converge on the unique idempotency key', async () => {
  let inserted;
  BillingSchedule.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (!inserted) {
      inserted = { _id: 'schedule-1', ...update.$setOnInsert };
      return inserted;
    }
    const duplicate = new Error('duplicate key');
    duplicate.code = 11000;
    throw duplicate;
  });
  BillingSchedule.findOne.mockImplementation(async (filter) => (
    filter.idempotencyKey && inserted?.idempotencyKey === filter.idempotencyKey
      ? inserted
      : null
  ));

  const params = {
    userId: 'user-id',
    subscriptionId: 'subscription-id',
    cardAddedAt: new Date('2026-10-01T00:00:00.000Z'),
    tier: 'pro',
    provider: 'stripe',
  };
  const [first, second] = await Promise.all([
    scheduleFirstCharge(params),
    scheduleFirstCharge(params),
  ]);

  expect(first).toBe(inserted);
  expect(second).toBe(inserted);
  expect(BillingSchedule.findOneAndUpdate).toHaveBeenCalledTimes(2);
  expect(inserted.idempotencyKey).toBe('first_charge:subscription-id');
});

test('reuses any existing first-charge schedule instead of recreating a completed one', async () => {
  const completed = { _id: 'schedule-1', status: 'completed' };
  BillingSchedule.findOne.mockResolvedValue(completed);

  await expect(scheduleFirstCharge({
    userId: 'user-id',
    subscriptionId: 'subscription-id',
    cardAddedAt: new Date(),
    tier: 'pro',
    provider: 'stripe',
  })).resolves.toBe(completed);

  expect(BillingSchedule.findOneAndUpdate).not.toHaveBeenCalled();
});
