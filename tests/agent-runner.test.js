/**
 * Unit tests for utils/agentRunner.js — the shared context/retry core used by
 * both the worker thread and the socket execution loop.
 *
 * The AI router is mocked so these tests stay deterministic and offline.
 */
jest.mock('../utils/aiRouterService', () => ({ routeChat: jest.fn() }));

const aiRouterService = require('../utils/aiRouterService');
const agentRunner = require('../utils/agentRunner');

const codeFiles = [
  { path: '/src', name: 'a.js', language: 'javascript', content: 'const total = 1;' },
  { path: '/src', name: 'b.js', language: 'javascript', content: 'export const b = 2;' },
  { path: '/docs', name: 'readme.md', language: 'markdown', content: '# Docs' },
];

describe('selectRelevantFiles', () => {
  test('ranks an explicitly named file first and keeps a full manifest', () => {
    const { files, manifest } = agentRunner.selectRelevantFiles(codeFiles, {
      task: { title: 'Fix totals', description: 'Update src/b.js so totals include tax' },
      limit: 2,
    });

    expect(files[0]).toMatchObject({ name: 'b.js' });
    expect(files).toHaveLength(2);
    expect(manifest.total).toBe(3);
    expect(manifest.paths).toEqual(expect.arrayContaining(['src/a.js', 'src/b.js', 'docs/readme.md']));
  });

  test('bounds per-file content without dropping the path', () => {
    const big = { path: '/src', name: 'big.js', language: 'javascript', content: 'x'.repeat(5000) };
    const { files } = agentRunner.selectRelevantFiles([big], {
      task: { description: 'big.js' },
      fileChars: 1000,
      totalChars: 10000,
    });
    expect(files[0].content).toContain('[truncated 4000 characters]');
    expect(files[0].name).toBe('big.js');
  });
});

describe('buildAgentContext', () => {
  test('includes task, project, specs, branch, and the prior failure', () => {
    const { messages, codeContext } = agentRunner.buildAgentContext({
      task: { title: 'Fix totals', description: 'Totals are wrong in the cart' },
      project: { name: 'Acme Store', status: 'active', technologies: ['Next.js'] },
      specs: [{ title: 'Cart contract', requirements: [{ text: 'Totals include tax' }] }],
      codeFiles,
      priorAttempt: { status: 'failed', error: 'previous parse failure' },
      branch: 'feature/cart',
      workspaceId: 'ws1',
    });

    const system = messages[0].content;
    expect(system).toContain('Fix totals');
    expect(system).toContain('Acme Store');
    expect(system).toContain('feature/cart');
    expect(system).toContain('previous parse failure');
    expect(system).toContain('### file: <relative/path/to/file>');
    expect(codeContext.fileManifest.total).toBe(3);
    expect(messages.some((message) => message.content.includes('Cart contract'))).toBe(true);
  });
});

describe('requestChangeSet', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retries a prose-only answer and returns the second attempt changes', async () => {
    aiRouterService.routeChat
      .mockResolvedValueOnce({ success: true, content: 'I would update src/a.js to fix this.' })
      .mockResolvedValueOnce({
        success: true,
        content: '### file: src/a.js\n```js\nconst total = 2;\n```',
      });

    const result = await agentRunner.requestChangeSet({
      messages: [{ role: 'user', content: 'Fix totals' }],
      codeFiles,
      maxAttempts: 3,
    });

    expect(result.success).toBe(true);
    expect(result.planOnly).toBe(false);
    expect(result.attemptsUsed).toBe(2);
    expect(result.changes[0]).toMatchObject({ path: 'src/a.js', action: 'update' });
    expect(aiRouterService.routeChat).toHaveBeenCalledTimes(2);
    expect(aiRouterService.routeChat.mock.calls[1][0].some((message) => /no file changes/i.test(message.content))).toBe(true);
  });

  test('returns a reviewable plan instead of failing when every attempt is prose', async () => {
    aiRouterService.routeChat.mockResolvedValue({ success: true, content: 'Here is the plan: refactor the cart.' });

    const result = await agentRunner.requestChangeSet({
      messages: [{ role: 'user', content: 'Fix totals' }],
      codeFiles,
      maxAttempts: 2,
    });

    expect(result.success).toBe(true);
    expect(result.planOnly).toBe(true);
    expect(result.exhausted).toBe(true);
    expect(result.attemptsUsed).toBe(2);
    expect(result.changes).toEqual([]);
    expect(aiRouterService.routeChat).toHaveBeenCalledTimes(2);
  });

  test('surfaces a real provider failure immediately', async () => {
    aiRouterService.routeChat.mockResolvedValue({ success: false, error: 'provider unavailable' });

    const result = await agentRunner.requestChangeSet({
      messages: [{ role: 'user', content: 'Fix totals' }],
      codeFiles,
      maxAttempts: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('provider unavailable');
    expect(result.attemptsUsed).toBe(1);
    expect(aiRouterService.routeChat).toHaveBeenCalledTimes(1);
  });
});
