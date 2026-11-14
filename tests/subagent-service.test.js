/**
 * Unit tests for utils/subagentService.js — subagent spawning and the
 * lighter-weight subagent tool loop.
 *
 * The AI router, mongoose models, realtime bus, and worker DB connection are
 * mocked so these tests stay deterministic and offline.
 */

jest.mock('../utils/aiRouterService', () => ({
  routeChat: jest.fn(),
}));
jest.mock('../models/SubagentExecution', () => {
  const Model = jest.fn();
  Model.create = jest.fn();
  Model.findById = jest.fn();
  Model.findOne = jest.fn();
  Model.find = jest.fn();
  return Model;
});
jest.mock('../models/AgentExecution', () => {
  const Model = jest.fn();
  Model.findById = jest.fn();
  return Model;
});
jest.mock('../utils/realtimeBus', () => ({
  emitSubagentSpawned: jest.fn(),
  emitSubagentProgress: jest.fn(),
  emitSubagentComplete: jest.fn(),
  emitSubagentError: jest.fn(),
  emitAgentProgress: jest.fn(),
}));
jest.mock('../utils/agentWorkerDatabase', () => ({
  connectWorkerDatabase: jest.fn().mockResolvedValue(undefined),
}));

const aiRouterService = require('../utils/aiRouterService');
const SubagentExecution = require('../models/SubagentExecution');
const AgentExecution = require('../models/AgentExecution');
const realtimeBus = require('../utils/realtimeBus');
const subagentService = require('../utils/subagentService');

const userId = 'user123';
const parentExecutionId = 'parentExec123';
const sessionId = 'session123';
const taskId = 'task123';
const projectId = 'project123';

const makeSubagent = (overrides = {}) => ({
  _id: 'subagent123',
  parentExecutionId,
  userId,
  sessionId,
  taskId,
  projectId,
  role: 'researcher',
  status: 'idle',
  instruction: 'research the login flow',
  output: '',
  error: '',
  logs: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeParent = (overrides = {}) => ({
  _id: parentExecutionId,
  userId,
  sessionId,
  taskId,
  projectId,
  taskTitle: 'Build login page',
  summary: 'Implement login',
  plan: 'Create auth pages',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  SubagentExecution.create.mockImplementation((subagentData) =>
    Promise.resolve({ ...makeSubagent(), ...subagentData })
  );
  SubagentExecution.findById.mockResolvedValue(makeSubagent());
  AgentExecution.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeParent()) });
  SubagentExecution.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeSubagent()) });
  SubagentExecution.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([makeSubagent()]),
  });
  aiRouterService.routeChat.mockResolvedValue({
    success: true,
    content: 'Research findings: login flow lives in src/auth.',
  });
});

describe('spawnSubagent validation', () => {
  test('requires parentExecutionId', async () => {
    await expect(subagentService.spawnSubagent({ role: 'researcher', instruction: 'x', userId })).rejects.toThrow(
      'parentExecutionId is required'
    );
  });

  test('requires role', async () => {
    await expect(subagentService.spawnSubagent({ parentExecutionId, instruction: 'x', userId })).rejects.toThrow(
      'role is required'
    );
  });

  test('requires instruction', async () => {
    await expect(subagentService.spawnSubagent({ parentExecutionId, role: 'researcher', userId })).rejects.toThrow(
      'instruction is required'
    );
  });

  test('requires userId', async () => {
    await expect(subagentService.spawnSubagent({ parentExecutionId, role: 'researcher', instruction: 'x' })).rejects.toThrow(
      'userId is required'
    );
  });

  test('rejects invalid role', async () => {
    await expect(
      subagentService.spawnSubagent({ parentExecutionId, role: 'designer', instruction: 'x', userId })
    ).rejects.toThrow('Invalid role');
  });

  test('throws when parent execution not found', async () => {
    AgentExecution.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    await expect(
      subagentService.spawnSubagent({ parentExecutionId, role: 'researcher', instruction: 'x', userId })
    ).rejects.toThrow('not found');
  });
});

describe('spawnSubagent creation', () => {
  test('creates a SubagentExecution record and returns it', async () => {
    const result = await subagentService.spawnSubagent({
      parentExecutionId,
      role: 'coder',
      instruction: 'implement the login form',
      userId,
    });

    expect(SubagentExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentExecutionId,
        userId,
        role: 'coder',
        instruction: 'implement the login form',
        status: 'idle',
      })
    );
    expect(result._id).toBeDefined();
    expect(result.role).toBe('coder');
    expect(result.status).toBe('idle');
  });

  test('inherits sessionId, taskId, projectId from parent when not provided', async () => {
    await subagentService.spawnSubagent({
      parentExecutionId,
      role: 'reviewer',
      instruction: 'review the plan',
      userId,
    });

    expect(SubagentExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        taskId,
        projectId,
      })
    );
  });

  test('emits agent:subagent:spawned socket event', async () => {
    await subagentService.spawnSubagent({
      parentExecutionId,
      role: 'tester',
      instruction: 'define tests',
      userId,
    });

    expect(realtimeBus.emitSubagentSpawned).toHaveBeenCalledWith(userId, expect.objectContaining({
      role: 'tester',
      status: 'idle',
    }));
  });

  test('all four roles are accepted', async () => {
    for (const role of ['researcher', 'coder', 'reviewer', 'tester']) {
      await subagentService.spawnSubagent({ parentExecutionId, role, instruction: 'do something', userId });
      expect(SubagentExecution.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ role })
      );
    }
  });
});

describe('listSubagents', () => {
  test('returns subagents for a parent execution', async () => {
    const result = await subagentService.listSubagents(parentExecutionId, userId);

    expect(SubagentExecution.find).toHaveBeenCalledWith({ parentExecutionId, userId });
    expect(result).toHaveLength(1);
  });
});

describe('getSubagent', () => {
  test('returns a single subagent by id and user', async () => {
    const result = await subagentService.getSubagent('subagent123', userId);

    expect(SubagentExecution.findOne).toHaveBeenCalledWith({ _id: 'subagent123', userId });
    expect(result._id).toBe('subagent123');
  });
});

describe('runSubagentLoop lighter-weight loop', () => {
  test('runs the loop, marks complete, stores output, and emits complete event', async () => {
    const subagent = makeSubagent({ status: 'idle' });
    SubagentExecution.findById.mockResolvedValue(subagent);

    const result = await subagentService.runSubagentLoop('subagent123', 'researcher', 'research login', userId);

    expect(aiRouterService.routeChat).toHaveBeenCalled();
    expect(subagent.status).toBe('complete');
    expect(subagent.output).toBe('Research findings: login flow lives in src/auth.');
    expect(subagent.completedAt).toBeInstanceOf(Date);
    expect(realtimeBus.emitSubagentComplete).toHaveBeenCalledWith(userId, expect.objectContaining({
      status: 'complete',
      output: 'Research findings: login flow lives in src/auth.',
    }));
    expect(result.success).toBe(true);
  });

  test('uses role-scoped system prompt', async () => {
    const subagent = makeSubagent({ role: 'reviewer', status: 'idle' });
    SubagentExecution.findById.mockResolvedValue(subagent);

    await subagentService.runSubagentLoop('subagent123', 'reviewer', 'review this', userId);

    const systemCall = aiRouterService.routeChat.mock.calls.find((call) =>
      call[0] && call[0].some((m) => m.role === 'system')
    );
    expect(systemCall).toBeDefined();
    const systemContent = systemCall[0].find((m) => m.role === 'system').content;
    expect(systemContent).toContain('Reviewer');
    expect(systemContent).toContain('review this');
  });

  test('marks failed and emits error on AI failure without throwing', async () => {
    aiRouterService.routeChat.mockResolvedValue({ success: false, error: 'provider unavailable' });
    const subagent = makeSubagent({ status: 'idle' });
    SubagentExecution.findById.mockResolvedValue(subagent);

    const result = await subagentService.runSubagentLoop('subagent123', 'coder', 'implement x', userId);

    expect(subagent.status).toBe('failed');
    expect(subagent.error).toBe('provider unavailable');
    expect(realtimeBus.emitSubagentError).toHaveBeenCalledWith(userId, expect.objectContaining({
      status: 'failed',
      error: 'provider unavailable',
    }));
    expect(result.success).toBe(false);
    // Error isolation: loop does not throw to caller.
    expect(result.subagentExecutionId).toBe('subagent123');
  });

  test('retries on a failed attempt then succeeds', async () => {
    aiRouterService.routeChat
      .mockResolvedValueOnce({ success: false, error: 'parse failure' })
      .mockResolvedValueOnce({ success: true, content: 'second attempt output' });
    const subagent = makeSubagent({ status: 'idle' });
    SubagentExecution.findById.mockResolvedValue(subagent);

    const result = await subagentService.runSubagentLoop('subagent123', 'researcher', 'research x', userId);

    expect(aiRouterService.routeChat).toHaveBeenCalledTimes(2);
    expect(subagent.output).toBe('second attempt output');
    expect(subagent.status).toBe('complete');
    expect(result.success).toBe(true);
  });

  test('throws to caller when subagent record not found', async () => {
    SubagentExecution.findById.mockResolvedValue(null);
    await expect(subagentService.runSubagentLoop('missing', 'researcher', 'x', userId)).rejects.toThrow(
      'not found'
    );
  });
});

describe('SUBAGENT_ROLES', () => {
  test('exposes all four roles', () => {
    expect(Object.keys(subagentService.SUBAGENT_ROLES)).toEqual(
      expect.arrayContaining(['researcher', 'coder', 'reviewer', 'tester'])
    );
  });

  test('each role has a label and system prompt', () => {
    for (const role of Object.values(subagentService.SUBAGENT_ROLES)) {
      expect(role.label).toBeDefined();
      expect(role.systemPrompt).toBeDefined();
    }
  });
});
