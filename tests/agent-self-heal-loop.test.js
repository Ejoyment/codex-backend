jest.mock('../utils/aiService', () => ({ chat: jest.fn() }));
jest.mock('../utils/vectorMemory', () => ({
  retrieve: jest.fn().mockResolvedValue([]),
  store: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/ChatMessage', () => ({
  create: jest.fn().mockResolvedValue({}),
}));
jest.mock('../models/AIPairSession', () => ({}));
jest.mock('../utils/realtimeBus', () => ({ emitAgentProgress: jest.fn() }));
jest.mock('../utils/hitlGates', () => class {
  requiresConfirmation() { return false; }
  async requestConfirmation() { return { approved: true }; }
  clearExpiredConfirmations() {}
});

const orchestrator = require('../utils/agentOrchestrator');

afterEach(() => {
  jest.restoreAllMocks();
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
    expect(prompt.length).toBeLessThan(12000);
  });
});
