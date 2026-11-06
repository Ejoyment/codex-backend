/**
 * CreditPoolService regression tests.
 *
 * `canDelegateAgent` counted AgentExecution documents without ever requiring
 * the model, so every call threw a ReferenceError. It now requires it, and the
 * remaining-credit getters delegate to the Subscription document.
 */
const fs = require('fs');
const path = require('path');

jest.mock('../models/Subscription', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../models/AgentExecution', () => ({ countDocuments: jest.fn() }));

const Subscription = require('../models/Subscription');
const AgentExecution = require('../models/AgentExecution');
const creditPool = require('../utils/creditPoolService');
const { enforceCreditPool } = require('../middleware/tierEnforcement');

function subscription(overrides = {}) {
  return {
    tier: 'pro',
    allowPayAsYouGo: false,
    creditPool: { usedThisMonth: 5 },
    cloudComputeHours: { usedThisMonth: 0 },
    getMonthlyCreditLimit: () => 20,
    getCloudComputeHours: () => 10,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('canDelegateAgent', () => {
  test('counts active jobs without throwing a ReferenceError', async () => {
    Subscription.findOne.mockResolvedValue({ tier: 'pro', getMaxConcurrentAgentJobs: () => 1 });
    AgentExecution.countDocuments.mockResolvedValue(0);

    const result = await creditPool.canDelegateAgent('u1');

    expect(result).toMatchObject({ allowed: true, activeJobs: 0, maxJobs: 1 });
    expect(AgentExecution.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  test('blocks when the concurrent-job cap is reached', async () => {
    Subscription.findOne.mockResolvedValue({ tier: 'pro', getMaxConcurrentAgentJobs: () => 1 });
    AgentExecution.countDocuments.mockResolvedValue(1);

    const result = await creditPool.canDelegateAgent('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max 1 concurrent/i);
  });

  test('developer tier is local-only', async () => {
    Subscription.findOne.mockResolvedValue({ tier: 'developer', getMaxConcurrentAgentJobs: () => 0 });
    const result = await creditPool.canDelegateAgent('u1');
    expect(result.allowed).toBe(false);
    expect(AgentExecution.countDocuments).not.toHaveBeenCalled();
  });
});

describe('remaining getters', () => {
  test('getRemainingCredits delegates to the subscription document', async () => {
    Subscription.findOne.mockResolvedValue({ getRemainingCredits: () => ({ tier: 'pro', limit: 20, used: 5, remaining: 15 }) });
    await expect(creditPool.getRemainingCredits('u1')).resolves.toMatchObject({ remaining: 15 });
  });

  test('getRemainingCompute delegates to the subscription document', async () => {
    Subscription.findOne.mockResolvedValue({ getRemainingCompute: () => ({ tier: 'pro', limit: 10, used: 2, remaining: 8 }) });
    await expect(creditPool.getRemainingCompute('u1')).resolves.toMatchObject({ remaining: 8 });
  });

  test('defaults to the developer shape when there is no subscription', async () => {
    Subscription.findOne.mockResolvedValue(null);
    await expect(creditPool.getRemainingCredits('u1')).resolves.toEqual({ tier: 'developer', remaining: 0, limit: 0 });
    await expect(creditPool.getRemainingCompute('u1')).resolves.toEqual({ tier: 'developer', remaining: 0, limit: 0 });
  });
});

describe('deductCredits', () => {
  test('atomically increments the pool and reports the remaining balance', async () => {
    Subscription.findOne.mockResolvedValue(subscription());
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({ creditPool: { usedThisMonth: 6 } }));

    const result = await creditPool.deductCredits('u1', 1);

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1', type: 'personal', 'creditPool.usedThisMonth': { $lte: 19 } },
      { $inc: { 'creditPool.usedThisMonth': 1 } },
      { new: true }
    );
    expect(result).toMatchObject({ success: true, overage: false, remaining: 14, amountDeducted: 1 });
  });

  test('rejects an exhausted pool before writing', async () => {
    Subscription.findOne.mockResolvedValue(subscription({ creditPool: { usedThisMonth: 20 } }));

    const result = await creditPool.deductCredits('u1', 1);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('allows Pay-As-You-Go overage past the monthly limit', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      allowPayAsYouGo: true,
      creditPool: { usedThisMonth: 20 },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      allowPayAsYouGo: true,
      creditPool: { usedThisMonth: 21 },
    }));

    const result = await creditPool.deductCredits('u1', 1);

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1', type: 'personal' },
      { $inc: { 'creditPool.usedThisMonth': 1 } },
      { new: true }
    );
    expect(result).toMatchObject({ success: true, overage: true, remaining: 0 });
  });

  test('fails when a concurrent request consumed the last credit', async () => {
    Subscription.findOne.mockResolvedValue(subscription({ creditPool: { usedThisMonth: 19 } }));
    Subscription.findOneAndUpdate.mockResolvedValue(null);

    const result = await creditPool.deductCredits('u1', 1);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/another request/i);
  });

  test('unlimited pools do not write', async () => {
    Subscription.findOne.mockResolvedValue(subscription({ getMonthlyCreditLimit: () => null }));
    const result = await creditPool.deductCredits('u1', 1);
    expect(result).toMatchObject({ success: true, remaining: Infinity });
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('developer tier has no cloud credits', async () => {
    Subscription.findOne.mockResolvedValue(subscription({ tier: 'developer' }));
    const result = await creditPool.deductCredits('u1', 1);
    expect(result.success).toBe(false);
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('refundCredits', () => {
  test('returns a charge without allowing a negative balance', async () => {
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({ creditPool: { usedThisMonth: 4 } }));

    const result = await creditPool.refundCredits('u1', 1);

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1', 'creditPool.usedThisMonth': { $gte: 1 } },
      { $inc: { 'creditPool.usedThisMonth': -1 } },
      { new: true }
    );
    expect(result).toMatchObject({ success: true, amountRefunded: 1, remaining: 16 });
  });

  test('does nothing when there is no charge to refund', async () => {
    Subscription.findOneAndUpdate.mockResolvedValue(null);
    const result = await creditPool.refundCredits('u1', 1);
    expect(result.success).toBe(false);
  });
});

describe('enforceCreditPool', () => {
  function run(sub) {
    const req = { subscription: sub };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    return { req, res, next, promise: enforceCreditPool()(req, res, next) };
  }

  test('blocks an exhausted pool without Pay-As-You-Go', async () => {
    const { res, next, promise } = run(subscription({ creditPool: { usedThisMonth: 20 } }));
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('lets Pay-As-You-Go through the exhausted-pool guard', async () => {
    const { next, promise } = run(subscription({
      allowPayAsYouGo: true,
      creditPool: { usedThisMonth: 20 },
    }));
    await promise;
    expect(next).toHaveBeenCalled();
  });
});

describe('deductComputeHours overage', () => {
  test('records usage inside the allowance without overage', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 5, overageHoursThisMonth: 0, overageAmountMinor: 0 },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 7, overageHoursThisMonth: 0, overageAmountMinor: 0 },
    }));

    const result = await creditPool.deductComputeHours('u1', 2);

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1' },
      {
        $inc: {
          'cloudComputeHours.usedThisMonth': 2,
          'cloudComputeHours.overageHoursThisMonth': 0,
          'cloudComputeHours.overageAmountMinor': 0,
        },
      },
      { new: true }
    );
    expect(result).toMatchObject({ success: true, overage: false, remaining: 3, hoursDeducted: 2 });
  });

  test('subtracts the preflight reservation from the charged duration', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 5.5, overageHoursThisMonth: 0, overageAmountMinor: 0 },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 7, overageHoursThisMonth: 0, overageAmountMinor: 0 },
    }));

    const result = await creditPool.deductComputeHours('u1', 2, { reservedHours: 0.5 });

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1' },
      {
        $inc: {
          'cloudComputeHours.usedThisMonth': 1.5,
          'cloudComputeHours.overageHoursThisMonth': 0,
          'cloudComputeHours.overageAmountMinor': 0,
        },
      },
      { new: true }
    );
    expect(result).toMatchObject({ success: true, hoursDeducted: 2 });
  });

  test('records only newly-created overage for an in-flight job', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 9, overageHoursThisMonth: 0, overageAmountMinor: 0 },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 11, overageHoursThisMonth: 1, overageAmountMinor: 0 },
    }));

    const result = await creditPool.deductComputeHours('u1', 2);

    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1' },
      {
        $inc: {
          'cloudComputeHours.usedThisMonth': 2,
          'cloudComputeHours.overageHoursThisMonth': 1,
          'cloudComputeHours.overageAmountMinor': 0,
        },
      },
      { new: true }
    );
    expect(result).toMatchObject({
      success: true,
      overage: true,
      overageHours: 1,
      remaining: 0,
    });
  });

  test('does not double-count overage already recorded this month', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 11, overageHoursThisMonth: 1, overageAmountMinor: 0 },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: { usedThisMonth: 12, overageHoursThisMonth: 2, overageAmountMinor: 0 },
    }));

    const result = await creditPool.deductComputeHours('u1', 1);

    expect(Subscription.findOneAndUpdate.mock.calls[0][1].$inc['cloudComputeHours.overageHoursThisMonth']).toBe(1);
    expect(result.overageHours).toBe(1);
  });

  test('does not accrue billable overage without opt-in', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 9,
        overageHoursThisMonth: 0,
        overageAmountMinor: 0,
        overageEnabled: false,
        overageCapMinor: 5000,
      },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 11,
        overageHoursThisMonth: 1,
        overageAmountMinor: 0,
        overageEnabled: false,
        overageCapMinor: 5000,
      },
    }));

    const result = await creditPool.deductComputeHours('u1', 2);

    expect(Subscription.findOneAndUpdate.mock.calls[0][1].$inc['cloudComputeHours.overageAmountMinor']).toBe(0);
    expect(result).toMatchObject({
      overage: true,
      overageHours: 1,
      overageAmountMinor: 0,
      overageEnabled: false,
    });
    expect(result.message).toMatch(/billing is disabled/i);
  });

  test('charges $1.00/hour when overage is opted in', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 9,
        overageHoursThisMonth: 0,
        overageAmountMinor: 0,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 11,
        overageHoursThisMonth: 1,
        overageAmountMinor: 100,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));

    const result = await creditPool.deductComputeHours('u1', 2);

    expect(Subscription.findOneAndUpdate.mock.calls[0][1].$inc['cloudComputeHours.overageAmountMinor']).toBe(100);
    expect(result).toMatchObject({
      overage: true,
      overageHours: 1,
      overageAmountMinor: 100,
      overageTotalAmountMinor: 100,
      overageEnabled: true,
      overageCapped: false,
    });
  });

  test('caps the accrued amount at the monthly ceiling', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 10,
        overageHoursThisMonth: 0,
        overageAmountMinor: 4950,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 11,
        overageHoursThisMonth: 1,
        overageAmountMinor: 5000,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));

    const result = await creditPool.deductComputeHours('u1', 1);

    expect(Subscription.findOneAndUpdate.mock.calls[0][1].$inc['cloudComputeHours.overageAmountMinor']).toBe(50);
    expect(result).toMatchObject({
      overageAmountMinor: 50,
      overageTotalAmountMinor: 5000,
      overageCapped: true,
    });
  });

  test('does not accrue past a reached cap', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 10,
        overageHoursThisMonth: 50,
        overageAmountMinor: 5000,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 11,
        overageHoursThisMonth: 51,
        overageAmountMinor: 5000,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));

    const result = await creditPool.deductComputeHours('u1', 1);

    expect(Subscription.findOneAndUpdate.mock.calls[0][1].$inc['cloudComputeHours.overageAmountMinor']).toBe(0);
    expect(result.overageCapped).toBe(true);
  });

  test('clamps a concurrent overshoot back to the cap', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 10,
        overageHoursThisMonth: 0,
        overageAmountMinor: 4950,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));
    Subscription.findOneAndUpdate.mockResolvedValue(subscription({
      cloudComputeHours: {
        usedThisMonth: 11,
        overageHoursThisMonth: 1,
        overageAmountMinor: 5100,
        overageEnabled: true,
        overageCapMinor: 5000,
      },
    }));

    const result = await creditPool.deductComputeHours('u1', 1);

    expect(Subscription.updateOne).toHaveBeenCalledWith(
      { userId: 'u1' },
      { $set: { 'cloudComputeHours.overageAmountMinor': 5000 } }
    );
    expect(result.overageTotalAmountMinor).toBe(5000);
  });

  test('unlimited compute does not write', async () => {
    Subscription.findOne.mockResolvedValue(subscription({ getCloudComputeHours: () => null }));

    const result = await creditPool.deductComputeHours('u1', 2);

    expect(result).toMatchObject({ success: true, remaining: Infinity });
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('developer tier has no compute allowance', async () => {
    Subscription.findOne.mockResolvedValue(subscription({
      tier: 'developer',
      getCloudComputeHours: () => 0,
    }));

    const result = await creditPool.deductComputeHours('u1', 1);

    expect(result.success).toBe(false);
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('agent delegate charging', () => {
  test('delegate charges the pool and refunds failed jobs', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'agent-v1.js'), 'utf8');
    expect(src).toMatch(/CreditPoolService\.deductCredits\(\s*req\.userId,\s*AGENT_JOB_CREDIT_COST\s*\)/);
    expect(src).toMatch(/refundAgentCredit\(req\.userId\)/);
    expect(src).toMatch(/creditsCharged:\s*AGENT_JOB_CREDIT_COST/);
  });

  test('socket and AI-pair agent paths also charge the pool', () => {
    const socketSrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'agentSocket.js'), 'utf8');
    const pairSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'ai-pair.js'), 'utf8');
    expect(socketSrc.match(/CreditPoolService\.deductCredits/g)).toHaveLength(2);
    expect(socketSrc.match(/CreditPoolService\.refundCredits/g)).toHaveLength(2);
    expect(pairSrc).toMatch(/CreditPoolService\.deductCredits/);
    expect(pairSrc).toMatch(/CreditPoolService\.refundCredits/);
  });
});
