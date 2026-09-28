/**
 * LSP manager tests — alias normalization, no-recursion guards, the real
 * Content-Length parser, and live typescript-language-server / pyright runs.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

const lspManager = require('../utils/lspManager');

describe('lspManager — language normalization', () => {
  test('maps aliases to server configs', () => {
    expect(lspManager.normalizeLanguage('javascript')).toBe('typescript');
    expect(lspManager.normalizeLanguage('js')).toBe('typescript');
    expect(lspManager.normalizeLanguage('jsx')).toBe('typescript');
    expect(lspManager.normalizeLanguage('typescript')).toBe('typescript');
    expect(lspManager.normalizeLanguage('ts')).toBe('typescript');
    expect(lspManager.normalizeLanguage('python')).toBe('python');
    expect(lspManager.normalizeLanguage('py')).toBe('python');
    expect(lspManager.normalizeLanguage('JAVA')).toBe('java');
  });

  test('unknown languages return null (not a config key)', () => {
    expect(lspManager.normalizeLanguage('lua')).toBeNull();
    expect(lspManager.normalizeLanguage('')).toBeNull();
    expect(lspManager.normalizeLanguage(undefined)).toBeNull();
  });

  test('getLanguageFromExtension maps known extensions', () => {
    expect(lspManager.getLanguageFromExtension('a.ts')).toBe('typescript');
    expect(lspManager.getLanguageFromExtension('a.js')).toBe('typescript');
    expect(lspManager.getLanguageFromExtension('a.py')).toBe('python');
    expect(lspManager.getLanguageFromExtension('a.md')).toBeNull();
  });
});

describe('lspManager — failure paths (regression: infinite recursion)', () => {
  test('unsupported language completions return empty without recursing', async () => {
    const started = Date.now();
    const result = await lspManager.getCompletions(
      'test-anon', 'lua', 'file:///a.lua', { line: 0, character: 0 }, 'x'
    );
    expect(result).toEqual({ items: [] });
    // Previously this recursed until RangeError; must fail fast.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('startServer rejects unknown languages', async () => {
    const result = await lspManager.startServer('test-anon', 'cobol');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported language/);
  });

  test('hover/definition/references degrade gracefully for unknown languages', async () => {
    const args = ['test-anon', 'lua', 'file:///a.lua', { line: 0, character: 0 }, 'x'];
    expect(await lspManager.getHover(...args)).toBeNull();
    expect(await lspManager.getDefinition(...args)).toBeNull();
    expect(await lspManager.getReferences(...args)).toEqual([]);
  });
});

describe('lspManager — live TypeScript server', () => {
  const userId = 'test-ts-user';
  const uri = 'file:///workspace/__lsp_test.ts';
  const content = 'const abc = 1;\nabc.';

  afterAll(async () => {
    await lspManager.stopServer(userId, 'typescript').catch(() => {});
  });

  test('starts via the javascript alias and answers initialize', async () => {
    const result = await lspManager.startServer(userId, 'javascript');
    expect(result.success).toBe(true);
    expect(result.language).toBe('typescript');
    expect(lspManager.capabilities.get('typescript')).toBeTruthy();
    // second start is a no-op
    const again = await lspManager.startServer(userId, 'typescript');
    expect(again.success).toBe(true);
  }, 30000);

  test('completions on abc. include Number methods', async () => {
    const res = await lspManager.getCompletions(userId, 'typescript', uri, { line: 1, character: 4 }, content);
    const labels = (res.items || []).map((i) => i.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toEqual(expect.arrayContaining(['toFixed', 'toString']));
  }, 30000);

  test('hover returns markdown contents', async () => {
    const hover = await lspManager.getHover(userId, 'js', uri, { line: 0, character: 6 }, content);
    expect(hover).toBeTruthy();
    const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
    const value = typeof contents[0] === 'string' ? contents[0] : contents[0]?.value || '';
    expect(value).toContain('abc');
  }, 30000);

  test('definition resolves within the same document', async () => {
    const def = await lspManager.getDefinition(userId, 'typescript', uri, { line: 1, character: 2 }, content);
    const first = Array.isArray(def) ? def[0] : def;
    expect(first).toBeTruthy();
    expect(first.uri || first.targetUri).toContain('__lsp_test.ts');
  }, 30000);

  test('didChange does not crash when server is running', async () => {
    await expect(
      lspManager.didChangeDocument(userId, 'typescript', uri, 'const abc = 2;\nabc.')
    ).resolves.toBeUndefined();
  });
});

describe('lspManager — live pyright server', () => {
  const userId = 'test-py-user';
  const uri = 'file:///workspace/__lsp_test.py';
  const content = 'import math\nmath.';

  afterAll(async () => {
    await lspManager.stopServer(userId, 'python').catch(() => {});
  });

  test('python completions come back from pyright', async () => {
    const start = await lspManager.startServer(userId, 'python');
    expect(start.success).toBe(true);
    const res = await lspManager.getCompletions(userId, 'py', uri, { line: 1, character: 5 }, content);
    expect((res.items || []).length).toBeGreaterThan(0);
  }, 40000);

  test('python hover resolves import module', async () => {
    const hover = await lspManager.getHover(userId, 'python', uri, { line: 0, character: 8 }, content);
    expect(hover).toBeTruthy();
  }, 40000);
});

describe('lsp route wiring', () => {
  test('routes/lsp exposes expected endpoints', () => {
    const router = require('../routes/lsp');
    const routes = (router.stack || [])
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(routes).toEqual(expect.arrayContaining([
      'POST /start',
      'POST /completions',
      'POST /hover',
      'POST /definition',
      'POST /references',
      'POST /change',
      'POST /close',
      'POST /stop',
    ]));
  });

  test('no recursive self-calls remain in lspManager', () => {
    const fs = require('fs');
    const src = fs.readFileSync(path.resolve(__dirname, '../utils/lspManager.js'), 'utf8');
    expect(src).not.toMatch(/return this\.get(Completions|Hover|Definition|References)\(/);
    expect(src).toContain("this._notify(server, 'initialized'");
    expect(src).toContain('Content-Length');
  });
});
