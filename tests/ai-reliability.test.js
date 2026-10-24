const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({ generateContent: mockGenerateContent })),
  })),
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
});
