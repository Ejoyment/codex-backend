jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const axios = require('axios');
const localBridge = require('../utils/localBridge');

describe('local AI bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localBridge.ollamaUrl = 'http://ollama.test';
    localBridge.lmStudioUrl = 'http://lmstudio.test';
  });

  test('uses LM Studio OpenAI-compatible endpoints and response shape', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Local answer' } }] },
    });

    const result = await localBridge.chat([
      { role: 'system', content: 'Respect project conventions.' },
      { role: 'user', content: 'Explain the source.' },
    ], {
      timeoutMs: 5000,
      files: [{ path: 'src/app.js', content: 'export const value = 1;' }],
    }, 'lm-studio');

    expect(axios.post).toHaveBeenCalledWith(
      'http://lmstudio.test/v1/chat/completions',
      expect.objectContaining({
        stream: false,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: expect.stringContaining('Respect project conventions.') }),
          expect.objectContaining({ role: 'system', content: expect.stringContaining('export const value = 1;') }),
          { role: 'user', content: 'Explain the source.' },
        ]),
      }),
      expect.objectContaining({ timeout: 5000 })
    );
    expect(result).toMatchObject({
      success: true,
      content: 'Local answer',
      provider: 'lm-studio',
      localMode: true,
    });
  });

  test('checks LM Studio using its models endpoint', async () => {
    axios.get.mockResolvedValue({ data: { data: [] } });

    await expect(localBridge.checkConnection('lm-studio')).resolves.toBe(true);

    expect(axios.get).toHaveBeenCalledWith('http://lmstudio.test/v1/models', { timeout: 3000 });
    expect(localBridge.getStatus()['lm-studio']).toBe(true);
  });

  test('parses chunked Ollama JSON lines and applies the requested timeout', async () => {
    async function* responseChunks() {
      yield Buffer.from('{"message":{"content":"Hello"}');
      yield Buffer.from('}\n{"message":{"content":" world"}}\n');
    }
    axios.post.mockResolvedValue({ data: responseChunks() });
    const chunks = [];

    const result = await localBridge.stream(
      [{ role: 'user', content: 'Say hello' }],
      { timeoutMs: 7000 },
      'ollama',
      (chunk) => chunks.push(chunk)
    );

    expect(axios.post).toHaveBeenCalledWith(
      'http://ollama.test/api/chat',
      expect.objectContaining({ stream: true }),
      expect.objectContaining({ timeout: 7000, signal: expect.any(AbortSignal) })
    );
    expect(result).toMatchObject({ success: true, content: 'Hello world', provider: 'ollama' });
    expect(chunks).toEqual(['Hello', ' world']);
  });

  test('parses LM Studio SSE content deltas', async () => {
    async function* responseChunks() {
      yield Buffer.from('data: {"choices":{"not":"used"}}\n');
      yield Buffer.from('data: {"choices":[{"delta":{"content":"Done"}}]}\n');
      yield Buffer.from('data: [DONE]\n');
    }
    axios.post.mockResolvedValue({ data: responseChunks() });

    const result = await localBridge.stream(
      [{ role: 'user', content: 'Finish' }],
      {},
      'lm-studio'
    );

    expect(axios.post).toHaveBeenCalledWith(
      'http://lmstudio.test/v1/chat/completions',
      expect.objectContaining({ stream: true }),
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(result).toMatchObject({ success: true, content: 'Done', provider: 'lm-studio' });
  });
});
