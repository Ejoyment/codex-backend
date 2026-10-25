const mockGenerateContent = jest.fn();
const originalLocalPrivacyMode = process.env.LOCAL_PRIVACY_MODE;
const originalLocalAiProvider = process.env.LOCAL_AI_PROVIDER;

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({ generateContent: mockGenerateContent })),
  })),
}));

jest.mock('../utils/githubService', () => ({
  listFiles: jest.fn(),
  listRepositoryFiles: jest.fn(),
  getFileContent: jest.fn(),
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
    delete process.env.LOCAL_PRIVACY_MODE;
    delete process.env.LOCAL_AI_PROVIDER;
    aiService = require('../utils/aiService');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalLocalPrivacyMode === undefined) delete process.env.LOCAL_PRIVACY_MODE;
    else process.env.LOCAL_PRIVACY_MODE = originalLocalPrivacyMode;
    if (originalLocalAiProvider === undefined) delete process.env.LOCAL_AI_PROVIDER;
    else process.env.LOCAL_AI_PROVIDER = originalLocalAiProvider;
    jest.restoreAllMocks();
  });

  test('constrains Groq GPT-OSS agent responses to the validated JSON action schema', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"thought":"Read package metadata","goalAchieved":false,"action":{"tool":"read_file","parameters":"{\\"path\\":\\"package.json\\"}"}}' } }] }),
    });
    process.env.GROQ_API_KEY = 'test-groq-key';

    try {
      await aiService.chatGroq([{ role: 'user', content: 'Inspect package.json' }], {
        agentMode: true,
        agentReasoning: true,
        availableTools: ['read_file', 'list_files'],
      });

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: {
          name: 'agent_reasoning',
          strict: true,
          schema: expect.objectContaining({
            properties: expect.objectContaining({
              action: expect.objectContaining({
                properties: expect.objectContaining({
                  tool: { type: 'string', enum: ['read_file', 'list_files', 'none'] },
                  parameters: { type: 'string' },
                }),
              }),
            }),
          }),
        },
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('rejects native Groq tool calls instead of treating them as agent JSON', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{ type: 'function', function: { name: 'read_file', arguments: '{"path":"package.json"}' } }],
          },
        }],
      }),
    });

    try {
      await expect(aiService.chatGroq([{ role: 'user', content: 'Inspect package metadata' }], {
        agentMode: true,
        agentReasoning: true,
        availableTools: ['read_file'],
      })).rejects.toThrow('Groq returned a native tool call');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('keeps delegated file-change proposals as text instead of ReAct JSON', async () => {
    const originalFetch = global.fetch;
    const proposal = '### file: src/index.js\n```js\nmodule.exports = true;\n```';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: proposal } }] }),
    });

    try {
      const result = await aiService.chatGroq([{ role: 'user', content: 'Implement the task' }], {
        agentMode: true,
        instructions: 'Return a written plan and file-level proposed changes.',
      });

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.response_format).toBeUndefined();
      expect(result.content).toBe(proposal);
      expect(aiService.buildSystemPrompt({
        agentMode: true,
        instructions: 'Return a written plan and file-level proposed changes.',
      })).toContain('Return the requested plan and file-level changes as message text.');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('preserves system and assistant roles in OpenAI-compatible provider requests', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Answer' } }] }),
    });
    aiService.providers.groq = {
      available: true,
      apiKey: 'test-groq-key',
      model: 'llama-3.3-70b-versatile',
      endpoint: 'https://example.test/chat',
    };

    try {
      await aiService.chatGroq([
        { role: 'system', content: 'Follow project rules.' },
        { role: 'user', content: 'Question one' },
        { role: 'assistant', content: 'Prior answer' },
        { role: 'user', content: 'Question two' },
      ], {});

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.messages.map(({ role }) => role)).toEqual([
        'system', 'system', 'user', 'assistant', 'user',
      ]);
      expect(requestBody.messages[1].content).toContain('Follow project rules.');
      expect(requestBody.messages[3].content).toBe('Prior answer');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('keeps all conversation turns and system instructions for Hugging Face', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ generated_text: 'Answer' }],
    });
    aiService.providers.huggingface = {
      available: true,
      apiKey: 'test-hf-key',
      model: 'test/model',
      endpoint: 'https://example.test/',
    };

    try {
      await aiService.chatHuggingFace([
        { role: 'system', content: 'Use the supplied project conventions.' },
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Follow-up question' },
      ], {});

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.inputs).toContain('Use the supplied project conventions.');
      expect(requestBody.inputs).toContain('User: First question');
      expect(requestBody.inputs).toContain('Assistant: Earlier answer');
      expect(requestBody.inputs).toContain('User: Follow-up question');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('places Gemini system messages in system instructions, not conversation history', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'Answer' } });

    await aiService.chatGemini([
      { role: 'system', content: 'Keep the response grounded in the repository.' },
      { role: 'user', content: 'What does this code do?' },
    ], {});

    const prompt = mockGenerateContent.mock.calls[0][0];
    expect(prompt).toContain('Keep the response grounded in the repository.');
    expect(prompt).toContain('User: What does this code do?');
    expect(prompt).not.toContain('Assistant: Keep the response grounded in the repository.');
  });

  test('rejects malformed or empty conversations with an actionable error', async () => {
    await expect(aiService.chat([], null)).resolves.toEqual({
      success: false,
      error: 'AI request context must be an object.',
    });
    await expect(aiService.chat([])).resolves.toEqual({
      success: false,
      error: 'AI request requires at least one message.',
    });
    await expect(aiService.chat([{ role: 'tool', content: 'result' }])).resolves.toEqual({
      success: false,
      error: 'AI messages must have a supported role and string content.',
    });
    await expect(aiService.chat([{ role: 'assistant', content: 'Only an answer' }])).resolves.toEqual({
      success: false,
      error: 'AI request requires at least one user message.',
    });
  });

  test('local model context includes bounded source file contents', () => {
    const localBridge = require('../utils/localBridge');
    const prompt = localBridge.buildSystemPrompt({
      files: [{ path: 'src/app.js', content: 'export const answer = 42;' }],
    });

    expect(prompt).toContain('--- src/app.js ---');
    expect(prompt).toContain('export const answer = 42;');
    expect(prompt).toContain('running on a local model');
  });

  test('direct AI service calls honor deployment-wide local privacy mode', async () => {
    const localBridge = require('../utils/localBridge');
    const localChat = jest.spyOn(localBridge, 'chat').mockResolvedValue({
      success: true,
      content: 'Kept local',
    });
    process.env.LOCAL_PRIVACY_MODE = 'true';

    const result = await aiService.chat([
      { role: 'user', content: 'Review this code' },
    ], { provider: 'groq', localPrivacyMode: false });

    expect(result.content).toBe('Kept local');
    expect(localChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Review this code' }],
      { provider: 'groq', localPrivacyMode: false },
      'ollama'
    );
  });

  test('parses the JSON-encoded tool parameters used by constrained agent responses', () => {
    const orchestrator = require('../utils/agentOrchestrator');
    const result = orchestrator.parseReasoningResponse(
      '{"thought":"Read the manifest","goalAchieved":false,"action":{"tool":"read_file","parameters":"{\\"path\\":\\"package.json\\"}"}}'
    );

    expect(result).toEqual({
      success: true,
      thought: 'Read the manifest',
      goalAchieved: false,
      action: { tool: 'read_file', parameters: { path: 'package.json' } },
    });
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

  test('agent completes file-list requests from the successful tool result', async () => {
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
    const reason = jest.spyOn(orchestrator, 'reason');
    const act = jest.spyOn(orchestrator, 'act').mockResolvedValue(filesResult);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue({});
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();

    const result = await orchestrator.executeAgenticLoop(
      'List the files',
      { userId: 'user-id', workspaceId: 'workspace-id' },
      'session-id'
    );

    expect(result.success).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
    expect(reason).not.toHaveBeenCalled();
    expect(result.summary.finalThought).toContain('/src/index.js');
    expect(observe).toHaveBeenCalledTimes(1);
  });

  test('agent gathers all requested repository inspection evidence before completing', async () => {
    const orchestrator = require('../utils/agentOrchestrator');
    const listResult = {
      success: true,
      source: 'github',
      files: [{ path: 'src/index.js', name: 'index.js' }],
    };
    const statusResult = {
      success: true,
      repository: { fullName: 'example/sample-repo' },
      branch: 'main',
      latestCommit: { sha: 'abc123', message: 'Initial commit' },
    };
    jest.spyOn(orchestrator, 'observe').mockResolvedValue({
      workspace: { name: 'test' },
      files: [],
    });
    const reason = jest.spyOn(orchestrator, 'reason');
    const act = jest.spyOn(orchestrator, 'act')
      .mockResolvedValueOnce(listResult)
      .mockResolvedValueOnce(statusResult);
    jest.spyOn(orchestrator, 'saveIteration').mockResolvedValue({});
    jest.spyOn(orchestrator, 'storeActionPattern').mockResolvedValue();

    const result = await orchestrator.executeAgenticLoop(
      'List files in this repo and the state of the repo',
      { userId: 'user-id', workspaceId: 'workspace-id' },
      'session-id'
    );

    expect(result.success).toBe(true);
    expect(reason).not.toHaveBeenCalled();
    expect(act.mock.calls.map(([action]) => action.tool)).toEqual([
      'list_files',
      'get_repository_status',
    ]);
    expect(result.summary.finalThought).toContain('src/index.js');
    expect(result.summary.finalThought).toContain('Latest commit: abc123');
  });

  test('list_files reads the connected GitHub repository for AI Pair sessions', async () => {
    const githubService = require('../utils/githubService');
    githubService.listRepositoryFiles.mockResolvedValue({
      branch: 'main',
      truncated: false,
      totalFiles: 1,
      files: [{ name: 'index.js', path: 'src/index.js', type: 'file' }],
    });
    const orchestrator = require('../utils/agentOrchestrator');

    const result = await orchestrator.tools.list_files.execute({}, {
      userId: 'user-id',
      repositoryOwner: 'example',
      repositoryName: 'sample-repo',
      repositoryBranch: 'main',
    });

    expect(githubService.listRepositoryFiles).toHaveBeenCalledWith(
      'user-id',
      'example',
      'sample-repo',
      'main'
    );
    expect(result).toMatchObject({
      success: true,
      source: 'github',
      totalFiles: 1,
      files: [{ path: 'src/index.js' }],
    });
  });

  test('read_file reads a path from the connected GitHub repository', async () => {
    const githubService = require('../utils/githubService');
    githubService.getFileContent.mockResolvedValue({
      path: 'src/index.js',
      content: 'module.exports = true;',
      sha: 'abc123',
    });
    const orchestrator = require('../utils/agentOrchestrator');

    const result = await orchestrator.tools.read_file.execute(
      { path: 'src/index.js' },
      {
        userId: 'user-id',
        repositoryOwner: 'example',
        repositoryName: 'sample-repo',
        repositoryBranch: 'main',
      }
    );

    expect(githubService.getFileContent).toHaveBeenCalledWith(
      'user-id',
      'example',
      'sample-repo',
      'src/index.js',
      'main'
    );
    expect(result).toMatchObject({
      success: true,
      source: 'github',
      path: 'src/index.js',
      language: 'js',
      content: 'module.exports = true;',
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
