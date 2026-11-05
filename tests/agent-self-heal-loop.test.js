jest.mock('../utils/aiService', () => ({ chat: jest.fn() }));
jest.mock('../utils/vectorMemory', () => ({
  retrieve: jest.fn().mockResolvedValue([]),
  store: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/ChatMessage', () => ({
  create: jest.fn().mockResolvedValue({}),
}));
jest.mock('../models/AIPairSession', () => ({}));
jest.mock('../models/CodeFile', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../utils/realtimeBus', () => ({ emitAgentProgress: jest.fn() }));
jest.mock('../utils/hitlGates', () => class {
  requiresConfirmation() { return false; }
  async requestConfirmation() { return { approved: true }; }
  clearExpiredConfirmations() {}
});

const mongoose = require('mongoose');
const CodeFile = require('../models/CodeFile');
const orchestrator = require('../utils/agentOrchestrator');

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('autonomous agent repair loop', () => {
  test('does not stop before changing a file when requireMutation is set', async () => {
    const baseState = { workspace: { id: 'w', name: 'workspace' }, files: [], currentFile: null };
    jest.spyOn(orchestrator, 'observe').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'feedback').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeSuccessfulPattern').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();
    const reason = jest.spyOn(orchestrator, 'reason')
      .mockResolvedValueOnce({
        success: true,
        thought: 'I read the logs, so it is done.',
        goalAchieved: true,
        action: null,
      })
      .mockResolvedValueOnce({
        success: true,
        thought: 'Add the missing client directive.',
        goalAchieved: false,
        action: { tool: 'update_file', parameters: { fileId: 'f1', content: 'x' } },
      })
      .mockResolvedValueOnce({
        success: true,
        thought: 'Fixed.',
        goalAchieved: true,
        action: null,
      });
    const act = jest.spyOn(orchestrator, 'act').mockResolvedValue({ success: true, message: 'Updated' });

    const result = await orchestrator.executeAgenticLoop('Repair the build', {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      autonomous: true,
      requireMutation: true,
      allowedTools: ['read_file', 'update_file'],
      autoApproveTools: ['update_file'],
      skipAutoValidation: true,
      maxRuntimeMs: 60000,
    }, 'session-1');

    expect(result.success).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
    expect(reason).toHaveBeenCalledTimes(3);
  });

  test('edit_file counts as a mutation for an autonomous repair', async () => {
    const baseState = { workspace: { id: 'w', name: 'workspace' }, files: [], currentFile: null };
    jest.spyOn(orchestrator, 'observe').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'feedback').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeSuccessfulPattern').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();
    const reason = jest.spyOn(orchestrator, 'reason')
      .mockResolvedValueOnce({
        success: true,
        thought: 'Replace the broken line.',
        goalAchieved: false,
        action: { tool: 'edit_file', parameters: { fileId: 'f1', oldText: 'a', newText: 'b' } },
      })
      .mockResolvedValueOnce({
        success: true,
        thought: 'Fixed.',
        goalAchieved: true,
        action: null,
      });
    const act = jest.spyOn(orchestrator, 'act').mockResolvedValue({ success: true, message: 'Edited' });

    const result = await orchestrator.executeAgenticLoop('Repair the build', {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      autonomous: true,
      requireMutation: true,
      allowedTools: ['read_file', 'edit_file'],
      autoApproveTools: ['edit_file'],
      skipAutoValidation: true,
      maxRuntimeMs: 60000,
    }, 'session-1');

    expect(result.success).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
    expect(reason).toHaveBeenCalledTimes(2);
  });

  test('autonomous reasoning prompt keeps tool history bounded', () => {
    const previousActions = Array.from({ length: 10 }, (_, i) => ({
      action: { tool: 'read_file', parameters: { fileId: `f${i}` } },
      result: { success: true, fileId: `f${i}`, content: 'x'.repeat(10000) },
    }));

    const prompt = orchestrator.buildReasoningPrompt('Repair the build', {
      iteration: 10,
      state: {
        workspace: { name: 'workspace' },
        files: [],
        currentFile: null,
        relevantMemories: [],
      },
      previousActions,
    }, {
      autonomous: true,
      allowedTools: ['read_file', 'update_file'],
    });

    expect(prompt).not.toContain('f0');
    expect(prompt).toContain('f9');
    expect(prompt.length).toBeLessThan(26000);
  });
});

describe('stack-agnostic file tools', () => {
  const context = { workspaceId: 'workspace-1', projectId: 'project-1', userId: 'user-1' };
  const fileId = new mongoose.Types.ObjectId().toString();

  const mockProjectFiles = (files) => {
    CodeFile.find.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(files),
      })),
    });
  };

  const editableFile = (overrides = {}) => ({
    _id: fileId,
    name: 'main.py',
    path: '/',
    language: 'python',
    content: 'import os\nprint(os.name)\n',
    versions: [],
    lastModifiedBy: null,
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  });

  test('edit_file replaces a unique snippet without rewriting the file', async () => {
    const file = editableFile();
    CodeFile.findOne.mockResolvedValue(file);

    const result = await orchestrator.tools.edit_file.execute({
      fileId,
      oldText: 'print(os.name)',
      newText: 'print(os.getcwd())',
    }, context);

    expect(result.success).toBe(true);
    expect(file.content).toBe('import os\nprint(os.getcwd())\n');
    expect(file.versions).toHaveLength(1);
    expect(file.save).toHaveBeenCalled();
  });

  test('edit_file refuses an ambiguous match unless replaceAll is set', async () => {
    const file = editableFile({ content: 'x = 1\nx = 1\n' });
    CodeFile.findOne.mockResolvedValue(file);

    const ambiguous = await orchestrator.tools.edit_file.execute({
      fileId,
      oldText: 'x = 1',
      newText: 'x = 2',
    }, context);
    expect(ambiguous.success).toBe(false);
    expect(ambiguous.error).toContain('occurs 2 times');
    expect(file.content).toBe('x = 1\nx = 1\n');

    const all = await orchestrator.tools.edit_file.execute({
      fileId,
      oldText: 'x = 1',
      newText: 'x = 2',
      replaceAll: true,
    }, context);
    expect(all.success).toBe(true);
    expect(file.content).toBe('x = 2\nx = 2\n');
  });

  test('create_file normalizes a nested name and updates an existing file', async () => {
    mockProjectFiles([]);
    CodeFile.create.mockResolvedValue({ _id: 'new-id', name: 'globals.css', path: '/app' });

    const created = await orchestrator.tools.create_file.execute({
      name: 'app/globals.css',
      content: 'body { margin: 0; }',
      language: 'css',
    }, context);

    expect(created.success).toBe(true);
    expect(created.created).toBe(true);
    expect(CodeFile.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'globals.css',
      path: '/app',
      company: context.workspaceId,
      project: context.projectId,
    }));

    const existingId = new mongoose.Types.ObjectId().toString();
    mockProjectFiles([{ _id: existingId, name: 'globals.css', path: '/app' }]);
    const existing = editableFile({
      _id: existingId,
      name: 'globals.css',
      path: '/app',
      language: 'css',
      content: 'old',
    });
    CodeFile.findOne.mockResolvedValue(existing);
    CodeFile.create.mockClear();

    const updated = await orchestrator.tools.create_file.execute({
      name: 'app/globals.css',
      content: 'body { margin: 1px; }',
      language: 'css',
    }, context);

    expect(updated.success).toBe(true);
    expect(updated.created).toBe(false);
    expect(CodeFile.create).not.toHaveBeenCalled();
    expect(existing.content).toBe('body { margin: 1px; }');
    expect(existing.save).toHaveBeenCalled();
  });

  test('read_file can page through a file that is too large for one prompt', async () => {
    CodeFile.findOne.mockResolvedValue({
      _id: fileId,
      content: 'abcdefghij',
      language: 'text',
      path: '/',
    });

    const page = await orchestrator.tools.read_file.execute({
      fileId,
      offset: 2,
      limit: 4,
    }, context);

    expect(page.success).toBe(true);
    expect(page.content).toBe('cdef');
    expect(page.truncated).toBe(true);
    expect(page.nextOffset).toBe(6);
  });
});

describe('deployment environment tools', () => {
  test('set_env records non-secret configuration on the run context', async () => {
    const context = {};
    const result = await orchestrator.tools.set_env.execute({
      vars: { PORT: '8080', NODE_ENV: 'production' },
    }, context);

    expect(result.success).toBe(true);
    expect(context.agentEnv).toEqual({ PORT: '8080', NODE_ENV: 'production' });
  });

  test('set_env refuses credential-shaped keys so secrets are never hardcoded', async () => {
    const context = {};
    const result = await orchestrator.tools.set_env.execute({
      vars: { STRIPE_API_KEY: 'sk_live_123', PORT: '8080' },
    }, context);

    expect(result.success).toBe(true);
    expect(context.agentEnv).toEqual({ PORT: '8080' });
    expect(result.rejected).toContain('STRIPE_API_KEY');
    expect(context.agentEnv.STRIPE_API_KEY).toBeUndefined();
  });

  test('declare_env_vars records the variables the user must supply', async () => {
    const context = {};
    const result = await orchestrator.tools.declare_env_vars.execute({
      vars: [{ key: 'DATABASE_URL', reason: 'Postgres connection string.' }],
    }, context);

    expect(result.success).toBe(true);
    expect(context.requiredEnv).toEqual([{
      key: 'DATABASE_URL',
      reason: 'Postgres connection string.',
    }]);
  });

  test('declaring required env satisfies the mutation requirement', async () => {
    const baseState = { workspace: { id: 'w', name: 'workspace' }, files: [], currentFile: null };
    jest.spyOn(orchestrator, 'observe').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'feedback').mockResolvedValue(baseState);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeSuccessfulPattern').mockResolvedValue();
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();
    const reason = jest.spyOn(orchestrator, 'reason')
      .mockResolvedValueOnce({
        success: true,
        thought: 'The app needs a database URL.',
        goalAchieved: false,
        action: { tool: 'declare_env_vars', parameters: { vars: [{ key: 'DATABASE_URL' }] } },
      })
      .mockResolvedValueOnce({
        success: true,
        thought: 'The user must supply the value.',
        goalAchieved: true,
        action: null,
      });
    const act = jest.spyOn(orchestrator, 'act').mockImplementation(async (action, context) => {
      context.requiredEnv = [{ key: 'DATABASE_URL', reason: null }];
      return { success: true, message: 'Declared' };
    });

    const result = await orchestrator.executeAgenticLoop('Repair the build', {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      autonomous: true,
      requireMutation: true,
      allowedTools: ['read_file', 'declare_env_vars'],
      autoApproveTools: ['declare_env_vars'],
      skipAutoValidation: true,
      maxRuntimeMs: 60000,
    }, 'session-1');

    expect(result.success).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
    expect(reason).toHaveBeenCalledTimes(2);
  });
});
