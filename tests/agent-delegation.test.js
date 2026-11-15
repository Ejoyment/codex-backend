/**
 * Unit tests for the orchestrator's subagent delegation: the `delegate_task`
 * tool, the per-run budget, and when a research pass is worth spawning.
 *
 * Everything the orchestrator touches on load (AI service, models, memory,
 * HITL gates, the subagent service) is mocked so the tests stay offline.
 */

jest.mock('../utils/aiService', () => ({ chat: jest.fn() }));
jest.mock('../utils/vectorMemory', () => ({ retrieve: jest.fn().mockResolvedValue([]) }));
jest.mock('../utils/hitlGates', () => jest.fn().mockImplementation(() => ({
  clearExpiredConfirmations: jest.fn(),
})));
jest.mock('../models/AIPairSession', () => ({}));
jest.mock('../models/ChatMessage', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../utils/subagentService', () => ({
  spawnSubagent: jest.fn(),
  SUBAGENT_ROLES: {
    researcher: { label: 'Researcher' },
    coder: { label: 'Coder' },
    reviewer: { label: 'Reviewer' },
    tester: { label: 'Tester' },
  },
}));

const subagentService = require('../utils/subagentService');
const orchestrator = require('../utils/agentOrchestrator');

const executionId = 'exec123';
const userId = 'user123';

const makeContext = (overrides = {}) => ({
  executionId,
  userId,
  subagentBudget: 3,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.AGENT_SUBAGENT_RESEARCH;
});

describe('delegate_task tool visibility', () => {
  test('is hidden from runs with no execution to attach a subagent to', () => {
    expect(orchestrator.toolNames({})).not.toContain('delegate_task');
    expect(orchestrator.toolNames(null)).not.toContain('delegate_task');
  });

  test('is offered when the run has an execution', () => {
    expect(orchestrator.toolNames({ executionId })).toContain('delegate_task');
  });

  test('still respects an explicit allow-list', () => {
    expect(orchestrator.toolNames({ executionId, allowedTools: ['read_file'] })).toEqual(['read_file']);
  });
});

describe('delegateTask', () => {
  test('refuses without a parent execution', async () => {
    const result = await orchestrator.delegateTask(
      { role: 'researcher', instruction: 'map the auth flow' },
      { userId, subagentBudget: 3 }
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no agent execution/i);
    expect(subagentService.spawnSubagent).not.toHaveBeenCalled();
  });

  test('refuses unknown roles and names the valid ones', async () => {
    const result = await orchestrator.delegateTask(
      { role: 'designer', instruction: 'do something' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('researcher');
    expect(subagentService.spawnSubagent).not.toHaveBeenCalled();
  });

  test('requires an instruction', async () => {
    const result = await orchestrator.delegateTask({ role: 'researcher' }, makeContext());
    expect(result.success).toBe(false);
    expect(subagentService.spawnSubagent).not.toHaveBeenCalled();
  });

  test('stops once the run budget is spent', async () => {
    const result = await orchestrator.delegateTask(
      { role: 'researcher', instruction: 'map it' },
      makeContext({ subagentBudget: 0 })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/budget/i);
    expect(subagentService.spawnSubagent).not.toHaveBeenCalled();
  });

  test('returns the subagent output and spends one unit of budget', async () => {
    subagentService.spawnSubagent.mockResolvedValue({
      _id: 'sub1',
      status: 'complete',
      output: 'The auth flow lives in src/auth/session.js',
    });
    const context = makeContext();

    const result = await orchestrator.delegateTask(
      { role: 'researcher', instruction: 'map the auth flow' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('The auth flow lives in src/auth/session.js');
    expect(result.subagentExecutionId).toBe('sub1');
    expect(context.subagentBudget).toBe(2);
    expect(subagentService.spawnSubagent).toHaveBeenCalledWith(expect.objectContaining({
      parentExecutionId: executionId,
      role: 'researcher',
      userId,
      awaitCompletion: true,
    }));
  });

  test('a failed subagent comes back as a tool error, not an exception', async () => {
    subagentService.spawnSubagent.mockResolvedValue({
      _id: 'sub2',
      status: 'failed',
      error: 'provider unavailable',
    });
    const context = makeContext();

    const result = await orchestrator.delegateTask(
      { role: 'coder', instruction: 'draft the change' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('provider unavailable');
    expect(context.subagentBudget).toBe(2);
  });

  test('a throwing subagent service is reported, not propagated', async () => {
    subagentService.spawnSubagent.mockRejectedValue(new Error('db down'));

    const result = await orchestrator.delegateTask(
      { role: 'researcher', instruction: 'map it' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('db down');
  });
});

describe('shouldPrefetchResearch', () => {
  const substantive = 'Implement a retry policy for the payment webhook handler so failed charges are retried';

  test('skips runs with no execution', () => {
    expect(orchestrator.shouldPrefetchResearch(substantive, { subagentBudget: 3 })).toBe(false);
  });

  test('skips background repair runs', () => {
    expect(orchestrator.shouldPrefetchResearch(substantive, makeContext({ autonomous: true }))).toBe(false);
  });

  test('skips short questions', () => {
    expect(orchestrator.shouldPrefetchResearch('what does this file do?', makeContext())).toBe(false);
  });

  test('skips requests that are not change work', () => {
    const explanation = 'Explain in detail how the billing scheduler decides when a subscription is cancelled and renewed';
    expect(orchestrator.shouldPrefetchResearch(explanation, makeContext())).toBe(false);
  });

  test('skips when the budget is spent', () => {
    expect(orchestrator.shouldPrefetchResearch(substantive, makeContext({ subagentBudget: 0 }))).toBe(false);
  });

  test('skips when there is too little time left for a research pass', () => {
    expect(orchestrator.shouldPrefetchResearch(
      substantive,
      makeContext({ agentDeadlineAt: Date.now() + 60 * 1000 })
    )).toBe(false);
  });

  test('honours the AGENT_SUBAGENT_RESEARCH=off escape hatch', () => {
    process.env.AGENT_SUBAGENT_RESEARCH = 'off';
    expect(orchestrator.shouldPrefetchResearch(substantive, makeContext())).toBe(false);
  });

  test('delegates a substantive change request', () => {
    expect(orchestrator.shouldPrefetchResearch(substantive, makeContext())).toBe(true);
  });
});
