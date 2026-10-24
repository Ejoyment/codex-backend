const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({ generateContent: mockGenerateContent })),
  })),
}));

jest.mock('../utils/githubService', () => ({
  listFiles: jest.fn(),
  getRepository: jest.fn(),
  getCommits: jest.fn(),
}));

describe('AI request reliability', () => {
  let aiService;

  beforeEach(() => {
    jest.resetModules();
    mockGenerateContent.mockReset();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GROQ_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.AI_REQUEST_TIMEOUT_MS;
    aiService = require('../utils/aiService');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('passes a bounded deadline to Gemini and includes source contents in agent context', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'Implemented safely.' } });
    const result = await aiService.chat([
      { role: 'user', content: 'Update the handler' },
    ], {
      provider: 'gemini',
      timeoutMs: 5000,
      agentMode: true,
      files: [{ path: 'src/handler.js', content: 'function handler() { return "old"; }' }],
    });

    expect(result).toMatchObject({ success: true, content: 'Implemented safely.' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.stringContaining('function handler() { return "old"; }'),
      expect.objectContaining({
        timeout: 5000,
        signal: expect.any(AbortSignal),
      })
    );
  });

  test('reports provider failure instead of returning a fabricated success response', async () => {
    mockGenerateContent.mockRejectedValue(new Error('upstream unavailable'));

    const result = await aiService.chat([
      { role: 'user', content: 'Implement the requested change' },
    ], { provider: 'gemini', timeoutMs: 1000 });

    expect(result).toEqual({ success: false, error: 'upstream unavailable' });
    expect(result.content).toBeUndefined();
  });

  test('aborts a stalled provider request at the configured deadline', async () => {
    mockGenerateContent.mockImplementation((prompt, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));

    const result = await aiService.chat([
      { role: 'user', content: 'Hello' },
    ], { provider: 'gemini', timeoutMs: 25 });

    expect(result.success).toBe(false);
    expect(mockGenerateContent.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('bounds included file context', () => {
    const prompt = aiService.buildSystemPrompt({
      files: [{ path: 'large.js', content: 'x'.repeat(100000) }],
    });

    expect(prompt.length).toBeLessThan(65000);
    expect(prompt).toContain('[File context truncated');
  });

  test('agent reasoning does not turn provider errors into successful completion', async () => {
    const orchestrator = require('../utils/agentOrchestrator');
    jest.spyOn(aiService, 'chat').mockResolvedValue({ success: false, error: 'provider failed' });

    const result = await orchestrator.reason('Make a change', {
      iteration: 1,
      state: {
        relevantMemories: [],
        validationErrors: [],
        workspace: { name: 'test' },
        files: [],
        currentFile: null,
      },
      previousActions: [],
    }, {});

    expect(result).toEqual({ success: false, error: 'provider failed' });
  });

  test('agent loop reports failure when reasoning cannot complete', async () => {
    const orchestrator = require('../utils/agentOrchestrator');
    jest.spyOn(orchestrator, 'observe').mockResolvedValue({ workspace: {}, files: [] });
    jest.spyOn(orchestrator, 'reason').mockResolvedValue({ success: false, error: 'provider failed' });

    const result = await orchestrator.executeAgenticLoop('Make a change', {}, 'session-id');

    expect(result.success).toBe(false);
    expect(result.iterations).toHaveLength(0);
  });

  test('agent loop feeds tool results forward and stops repeated successful actions', async () => {
    const orchestrator = require('../utils/agentOrchestrator');
    const filesResult = {
      success: true,
      truncated: false,
      files: [{ path: '/src/index.js', name: 'index.js', language: 'javascript' }],
    };
    const observe = jest.spyOn(orchestrator, 'observe').mockResolvedValue({
      workspace: { name: 'test' },
      files: [],
    });
    const prompts = [];
    const reason = jest.spyOn(orchestrator, 'reason')
      .mockImplementation(async (goal, observation, context) => {
        prompts.push(orchestrator.buildReasoningPrompt(goal, observation, context));
        return {
          success: true,
          thought: 'I should list the files.',
          goalAchieved: false,
          action: { tool: 'list_files', parameters: {} },
        };
      });
    const act = jest.spyOn(orchestrator, 'act').mockResolvedValue(filesResult);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue({});
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();

    const result = await orchestrator.executeAgenticLoop(
      'List the files',
      { userId: 'user-id', workspaceId: 'workspace-id' },
      'session-id'
    );

    expect(result.success).toBe(false);
    expect(act).toHaveBeenCalledTimes(1);
    expect(reason).toHaveBeenCalledTimes(2);
    expect(reason.mock.calls[1][1].previousActions[0].result).toEqual(filesResult);
    expect(prompts[1]).toContain('/src/index.js');
    expect(result.summary.finalThought).toContain('/src/index.js');
    expect(result.summary.stopReason).toMatch(/avoid repeating list_files/);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  test('list_files reads the connected GitHub repository for AI Pair sessions', async () => {
    const githubService = require('../utils/githubService');
    githubService.listFiles.mockResolvedValue([
      { name: 'index.js', path: 'src/index.js', type: 'file' },
    ]);
    const orchestrator = require('../utils/agentOrchestrator');

    const result = await orchestrator.tools.list_files.execute({}, {
      userId: 'user-id',
      repositoryOwner: 'example',
      repositoryName: 'sample-repo',
      repositoryBranch: 'main',
    });

    expect(githubService.listFiles).toHaveBeenCalledWith(
      'user-id',
      'example',
      'sample-repo',
      '',
      'main'
    );
    expect(result).toMatchObject({
      success: true,
      source: 'github',
      files: [{ path: 'src/index.js' }],
    });
  });

  test('repository status reports the latest commit without claiming local git state', async () => {
    const githubService = require('../utils/githubService');
    githubService.getRepository.mockResolvedValue({
      name: 'sample-repo',
      defaultBranch: 'main',
    });
    githubService.getCommits.mockResolvedValue([
      { sha: 'abc123', message: 'Initial commit' },
    ]);
    const orchestrator = require('../utils/agentOrchestrator');

    const result = await orchestrator.tools.get_repository_status.execute({}, {
      userId: 'user-id',
      repositoryOwner: 'example',
      repositoryName: 'sample-repo',
      repositoryBranch: 'main',
    });

    expect(githubService.getCommits).toHaveBeenCalledWith(
      'user-id',
      'example',
      'sample-repo',
      'main',
      null,
      1
    );
    expect(result).toMatchObject({
      success: true,
      branch: 'main',
      latestCommit: { sha: 'abc123' },
    });
    const summary = orchestrator.generateSummary({
      goal: 'Check repository status',
      iterations: [{
        action: { tool: 'get_repository_status' },
        reasoning: { thought: 'Check remote state.' },
        result,
      }],
    });
    expect(summary.finalThought).toContain('Latest commit: abc123 — Initial commit');
    expect(summary.finalThought).toContain('not local uncommitted changes');
  });

  test('agent iteration messages include the required user ID', async () => {
    const orchestrator = require('../utils/agentOrchestrator');
    const ChatMessage = require('../models/ChatMessage');
    const create = jest.spyOn(ChatMessage, 'create').mockResolvedValue({});
    const sessionId = '507f1f77bcf86cd799439011';
    const userId = '507f191e810c19729de860ea';
    const iteration = { iteration: 1, thought: 'Inspect the code' };

    await orchestrator.saveIteration(sessionId, iteration, userId);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      userId,
      role: 'system',
      content: JSON.stringify(iteration),
    }));
  });

  test('agent iteration persistence rejects a missing user ID clearly', async () => {
    const orchestrator = require('../utils/agentOrchestrator');

    await expect(orchestrator.saveIteration('507f1f77bcf86cd799439011', {}))
      .rejects.toThrow('User ID is required to save an agent iteration');
  });

  test('read-only agent tools do not wait for user confirmation on developer tier', () => {
    const HITLGates = require('../utils/hitlGates');
    const gates = new HITLGates();

    for (const tool of [
      'read_file',
      'list_files',
      'search_code',
      'analyze_code',
      'get_repository_status',
    ]) {
      expect(gates.requiresConfirmation(tool, {}, 'developer')).toBe(false);
    }
  });

  test('high-risk agent tools still require confirmation', () => {
    const HITLGates = require('../utils/hitlGates');
    const gates = new HITLGates();

    expect(gates.requiresConfirmation('delete_file', {}, 'developer')).toBe(true);
    expect(gates.requiresConfirmation('execute_code', {}, 'developer')).toBe(true);
    expect(gates.requiresConfirmation('create_multiple_files', {}, 'pro')).toBe(true);
    expect(gates.requiresConfirmation('delete_file', {}, 'enterprise')).toBe(true);
  });

  test('ordinary write tools retain the developer-tier confirmation gate', () => {
    const HITLGates = require('../utils/hitlGates');
    const gates = new HITLGates();

    expect(gates.requiresConfirmation('update_file', {}, 'developer')).toBe(true);
    expect(gates.requiresConfirmation('update_file', {}, 'pro')).toBe(false);
  });
});
