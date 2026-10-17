/**
 * CreditPoolService regression tests.
 *
 * `canDelegateAgent` counted AgentExecution documents without ever requiring
 * the model, so every call threw a ReferenceError. It now requires it, and the
 * remaining-credit getters delegate to the Subscription document.
 */
jest.mock('../models/Subscription', () => ({ findOne: jest.fn() }));
jest.mock('../models/AgentExecution', () => ({ countDocuments: jest.fn() }));

const Subscription = require('../models/Subscription');
const AgentExecution = require('../models/AgentExecution');
const creditPool = require('../utils/creditPoolService');

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
