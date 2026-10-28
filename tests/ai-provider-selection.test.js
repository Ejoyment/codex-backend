const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'GEMINI_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'HUGGINGFACE_API_KEY',
  'LOCAL_PRIVACY_MODE',
  'LOCAL_AI_PROVIDER',
];

describe('AI provider selection', () => {
  let originalEnv;
  let aiRouterService;
  let aiService;

  beforeEach(() => {
    originalEnv = Object.fromEntries(AI_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of AI_ENV_KEYS) delete process.env[key];
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of AI_ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function loadServices() {
    aiRouterService = require('../utils/aiRouterService');
    aiService = require('../utils/aiService');
  }

  test('uses Groq automatically when it is the only configured cloud provider', () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    loadServices();

    expect(aiRouterService.resolveProviderName().provider).toBe('groq');
    expect(aiService.resolveProvider()).toBe('groq');
    expect(aiRouterService.getAvailableProviders().map(({ key }) => key)).toEqual(['groq']);
  });

  test('prefers explicit AI_PROVIDER when multiple providers are configured', () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    loadServices();

    expect(aiRouterService.resolveProviderName().provider).toBe('groq');
    expect(aiService.resolveProvider()).toBe('groq');
  });

  test('per-request provider overrides AI_PROVIDER', () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    loadServices();

    expect(aiRouterService.resolveProviderName('groq').provider).toBe('groq');
    expect(aiService.resolveProvider('groq')).toBe('groq');
  });

  test('does not fall back from the explicitly configured AI_PROVIDER after an upstream failure', async () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    loadServices();
    const groqChat = jest.spyOn(aiService, 'chatGroq').mockRejectedValue(new Error('Groq unavailable'));
    const geminiChat = jest.spyOn(aiService, 'chatGemini');

    const result = await aiService.chat([
      { role: 'user', content: 'hello' },
    ]);

    expect(result).toEqual({ success: false, error: 'Groq unavailable' });
    expect(groqChat).toHaveBeenCalledTimes(1);
    expect(geminiChat).not.toHaveBeenCalled();
  });

  test('does not replace an unavailable explicit provider with another configured provider', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    loadServices();

    expect(() => aiRouterService.resolveProviderName('mistral'))
      .toThrow(/provider "mistral" is selected but not configured/i);
    expect(() => aiService.resolveProvider('mistral'))
      .toThrow(/provider "mistral" is selected but not configured/i);
  });

  test('fails with a configuration error when no cloud provider is available', () => {
    loadServices();

    expect(() => aiRouterService.resolveProviderName())
      .toThrow(/no ai provider configured/i);
    expect(() => aiService.resolveProvider())
      .toThrow(/no ai provider configured/i);
  });

  test('local privacy mode routes locally without a cloud API key', async () => {
    process.env.LOCAL_PRIVACY_MODE = 'true';
    loadServices();
    const routeLocal = jest.spyOn(aiRouterService, 'routeLocal').mockResolvedValue({ success: true });

    await aiRouterService.routeChat([{ role: 'user', content: 'hello' }]);

    expect(routeLocal).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      {},
      'ollama'
    );
  });
});
