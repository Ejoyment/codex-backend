jest.mock('../models/AgentExecution', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/Subscription', () => ({
  findOne: jest.fn(),
}));
jest.mock('../utils/creditPoolService', () => ({
  deductComputeHours: jest.fn(),
}));

const AgentExecution = require('../models/AgentExecution');
const Subscription = require('../models/Subscription');
const CreditPoolService = require('../utils/creditPoolService');
const { hoursBetween, meterExecution, MIN_METERED_HOURS } = require('../utils/computeMeter');

const execution = (over = {}) => ({
  userId: '507f1f77bcf86cd799439011',
  status: 'completed',
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: new Date('2026-01-01T02:00:00.000Z'),
  computeHoursMeteredAt: null,
  ...over,
});

function mockFindExecution(doc) {
  AgentExecution.findById.mockReturnValue({
    select: () => ({ lean: async () => doc }),
  });
}

function mockSubscription(tier) {
  Subscription.findOne.mockReturnValue({
    select: () => ({ lean: async () => ({ tier }) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  AgentExecution.findOneAndUpdate.mockResolvedValue({ _id: 'claimed' });
  CreditPoolService.deductComputeHours.mockResolvedValue({ success: true, remaining: 9 });
});

describe('compute-hour metering', () => {
  test('uses elapsed time with a one-minute floor', () => {
    expect(hoursBetween('2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z')).toBe(2);
    expect(hoursBetween('2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z')).toBe(MIN_METERED_HOURS);
  });

  test('charges a paid execution once', async () => {
    mockFindExecution(execution());
    mockSubscription('pro');

    const result = await meterExecution('exec-1');

    expect(result.metered).toBe(true);
    expect(result.hours).toBe(2);
    expect(AgentExecution.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'exec-1', computeHoursMeteredAt: null },
      { $set: expect.objectContaining({ computeHours: 2 }) },
      { new: false }
    );
    expect(CreditPoolService.deductComputeHours).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      2,
      { reservedHours: 0 }
    );
  });

  test('passes the preflight reservation to the charge path', async () => {
    mockFindExecution(execution({ computeReservationHours: 0.5 }));
    mockSubscription('pro');

    await meterExecution('exec-1');

    expect(CreditPoolService.deductComputeHours).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      2,
      { reservedHours: 0.5 }
    );
  });

  test('does not charge the free/developer tier', async () => {
    mockFindExecution(execution());
    mockSubscription('developer');

    const result = await meterExecution('exec-1');

    expect(result.metered).toBe(false);
    expect(AgentExecution.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CreditPoolService.deductComputeHours).not.toHaveBeenCalled();
  });

  test('is idempotent when another worker claimed the execution', async () => {
    mockFindExecution(execution());
    mockSubscription('pro');
    AgentExecution.findOneAndUpdate.mockResolvedValue(null);

    const result = await meterExecution('exec-1');

    expect(result.metered).toBe(false);
    expect(CreditPoolService.deductComputeHours).not.toHaveBeenCalled();
  });
});
