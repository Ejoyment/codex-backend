/**
 * IDE Run engine tests — manifest integrity, validation, problem parsers,
 * rate gate, and real host-strategy execution.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

const {
  MANIFEST,
  resolveLanguage,
  listLanguages,
  sanitizeFiles,
  buildContainerScript,
  parseProblems,
  rateGate,
  executeRun,
  generateRunId,
  pickStrategy,
  OUTPUT_CAP,
} = require('../utils/ideRunner');

describe('ideRunner — manifest', () => {
  test('has at least 20 runnable languages', () => {
    expect(Object.keys(MANIFEST).length).toBeGreaterThanOrEqual(20);
  });

  test('every language has required fields and callables', () => {
    for (const [id, def] of Object.entries(MANIFEST)) {
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(typeof def.image).toBe('string');
      expect(def.image.includes(' ')).toBe(false);
      expect(typeof def.defaultEntry).toBe('string');
      expect(typeof def.timeoutMs).toBe('number');
      expect(typeof def.script).toBe('function');
      expect(typeof def.host).toBe('function');
      expect(typeof def.errorStyle).toBe('string');
      // container script must run the entry in /work
      const script = def.script({ entry: def.defaultEntry });
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
      // host argv must be a non-empty array of strings
      const argv = def.host({
        entry: def.defaultEntry,
        absEntry: `/tmp/${def.defaultEntry}`,
        tmp: '/tmp',
      });
      expect(Array.isArray(argv)).toBe(true);
      expect(argv.length).toBeGreaterThan(1);
      expect(argv.every((a) => typeof a === 'string')).toBe(true);
      expect(argv[0].length).toBeGreaterThan(0);
    }
  });

  test('aliases are unique across languages', () => {
    const seen = new Set(Object.keys(MANIFEST));
    for (const def of Object.values(MANIFEST)) {
      for (const a of def.aliases || []) {
        expect(seen.has(a)).toBe(false);
        seen.add(a);
      }
    }
  });

  test('listLanguages returns every id with a defaultEntry', () => {
    const list = listLanguages();
    expect(list.length).toBe(Object.keys(MANIFEST).length);
    for (const l of list) {
      expect(l.id).toBeTruthy();
      expect(l.name).toBeTruthy();
      expect(l.defaultEntry).toBeTruthy();
    }
  });
});

describe('ideRunner — resolveLanguage', () => {
  test('resolves ids and aliases case-insensitively', () => {
    expect(resolveLanguage('javascript').id).toBe('javascript');
    expect(resolveLanguage('js').id).toBe('javascript');
    expect(resolveLanguage('NODE').id).toBe('javascript');
    expect(resolveLanguage('py').id).toBe('python');
    expect(resolveLanguage('golang').id).toBe('go');
    expect(resolveLanguage(' rs ').id).toBe('rust');
  });

  test('unknown language returns null', () => {
    expect(resolveLanguage('cobol')).toBeNull();
    expect(resolveLanguage('')).toBeNull();
    expect(resolveLanguage(undefined)).toBeNull();
  });
});

describe('ideRunner — sanitizeFiles', () => {
  const ok = (files) => sanitizeFiles(files);

  test('accepts nested relative paths', () => {
    const v = ok([
      { path: 'src/app.js', content: 'console.log(1)' },
      { path: 'README.md', content: '# hi' },
    ]);
    expect(v.error).toBeUndefined();
    expect(v.files).toHaveLength(2);
    expect(v.files[0].path).toBe('src/app.js');
  });

  test('rejects empty/non-array input', () => {
    expect(ok([]).error).toMatch(/non-empty/);
    expect(ok('nope').error).toMatch(/non-empty/);
    expect(ok(undefined).error).toMatch(/non-empty/);
  });

  test('rejects path traversal', () => {
    expect(ok([{ path: '../x.js', content: 'x' }]).error).toMatch(/Invalid file path/);
    expect(ok([{ path: 'a/../../x.js', content: 'x' }]).error).toMatch(/Invalid file path/);
  });

  test('rejects absolute paths', () => {
    expect(ok([{ path: '/etc/passwd', content: 'x' }]).error).toMatch(/Absolute/);
  });

  test('rejects shell/HTML metacharacters in paths', () => {
    expect(ok([{ path: 'x;rm -rf.js', content: 'x' }]).error).toMatch(/Invalid/);
    expect(ok([{ path: 'x<script>.js', content: 'x' }]).error).toMatch(/Invalid/);
    expect(ok([{ path: 'a b.js', content: 'x' }]).error).toMatch(/Invalid/);
  });

  test('rejects non-string content', () => {
    expect(ok([{ path: 'a.js', content: 42 }]).error).toMatch(/string content/);
  });

  test('rejects too many files', () => {
    const files = Array.from({ length: 51 }, (_, i) => ({ path: `f${i}.js`, content: 'x' }));
    expect(ok(files).error).toMatch(/Too many files/);
  });

  test('rejects oversized single file', () => {
    expect(ok([{ path: 'big.js', content: 'a'.repeat(1024 * 1024 + 1) }]).error).toMatch(/1MB/);
  });

  test('rejects total payload over 4MB', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: `f${i}.js`,
      content: 'a'.repeat(900 * 1024),
    }));
    expect(ok(files).error).toMatch(/4MB/);
  });
});

describe('ideRunner — buildContainerScript', () => {
  test('writes files as base64 and runs the entry from /work', () => {
    const def = resolveLanguage('javascript');
    const script = buildContainerScript(def, [
      { path: 'main.js', content: 'console.log("hi")' },
      { path: 'src/util.js', content: 'module.exports = 1' },
    ], 'main.js', []);
    expect(script).toContain('set -e');
    expect(script).toContain('mkdir -p /work');
    expect(script).toContain('mkdir -p \'/work/src\'');
    expect(script).toContain('base64 -d > \'/work/main.js\'');
    expect(script).toContain('base64 -d > \'/work/src/util.js\'');
    expect(script).toContain('cd /work');
    expect(script).toContain('node main.js');
    // raw content never leaks into the shell
    expect(script).not.toContain('console.log');
  });

  test('appends shell-quoted args', () => {
    const def = resolveLanguage('javascript');
    const script = buildContainerScript(def, [{ path: 'main.js', content: 'x' }], 'main.js', ["a b", "it's"]);
    expect(script).toContain("'a b'");
    // single-quote safe escaping: it'\''s
    expect(script).toContain("'it'\\''s'");
  });
});

describe('ideRunner — parseProblems', () => {
  test('gcc style', () => {
    const out = "main.c:3:5: error: expected ';' before 'return'\nmain.c:1:1: warning: unused variable 'x'";
    const p = parseProblems('gcc', out);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ file: 'main.c', line: 3, column: 5, severity: 'error' });
    expect(p[1].severity).toBe('warning');
  });

  test('gcc style strips /work prefix', () => {
    const p = parseProblems('gcc', '/work/main.c:1:1: error: bad');
    expect(p[0].file).toBe('main.c');
  });

  test('python traceback style', () => {
    const out = [
      'Traceback (most recent call last):',
      '  File "main.py", line 2, in <module>',
      '    foo()',
      'NameError: name \'foo\' is not defined',
    ].join('\n');
    const p = parseProblems('python', out);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ file: 'main.py', line: 2, severity: 'error' });
    expect(p[0].message).toContain('NameError');
  });

  test('go style', () => {
    const p = parseProblems('go', 'main.go:5:2: undefined: fmtx');
    expect(p[0]).toMatchObject({ file: 'main.go', line: 5, column: 2, severity: 'error' });
  });

  test('rustc style pairs error with location', () => {
    const out = 'error[E0425]: cannot find value `x` in this scope\n --> main.rs:3:13\n  |\n3 | let y = x;';
    const p = parseProblems('rustc', out);
    expect(p[0]).toMatchObject({ file: 'main.rs', line: 3, column: 13, severity: 'error' });
  });

  test('javac style', () => {
    const p = parseProblems('javac', 'Main.java:4: error: illegal start of expression');
    expect(p[0]).toMatchObject({ file: 'Main.java', line: 4, severity: 'error' });
  });

  test('php style', () => {
    const p = parseProblems('php', 'PHP Parse error:  syntax error, unexpected token "}" in main.php on line 7');
    expect(p[0]).toMatchObject({ file: 'main.php', line: 7, severity: 'error' });
  });

  test('node fallback when only a bare Error line exists', () => {
    const p = parseProblems('node', 'Error: boom');
    expect(p).toHaveLength(1);
    expect(p[0].message).toBe('Error: boom');
  });

  test('lua style (with and without lua: prefix)', () => {
    const a = parseProblems('lua', 'lua: main.lua:3: attempt to perform arithmetic on a nil value');
    expect(a[0]).toMatchObject({ file: 'main.lua', line: 3, severity: 'error' });
    const b = parseProblems('lua', "main.lua:1: unexpected symbol near ')'");
    expect(b[0]).toMatchObject({ file: 'main.lua', line: 1, severity: 'error' });
  });

  test('groovy style extracts line and column from @ line hint', () => {
    const p = parseProblems('groovy', 'main.groovy: 2: unexpected token: } @ line 2, column 5');
    expect(p[0]).toMatchObject({ file: 'main.groovy', line: 2, column: 5, severity: 'error' });
    expect(p[0].message).toBe('unexpected token: }');
  });

  test('groovy fallback for exception-only output', () => {
    const p = parseProblems('groovy', 'Exception in thread "main" groovy.lang.MissingMethodException: no method');
    expect(p[0]).toMatchObject({ file: 'main', line: 1, severity: 'error' });
  });

  test('no false positives on clean output', () => {
    expect(parseProblems('gcc', 'hello world')).toHaveLength(0);
    expect(parseProblems('python', '42')).toHaveLength(0);
    expect(parseProblems('go', 'ok')).toHaveLength(0);
    expect(parseProblems('lua', 'hello from lua')).toHaveLength(0);
    expect(parseProblems('groovy', 'Hello, World!')).toHaveLength(0);
  });

  test('caps at 100 problems', () => {
    const out = Array.from({ length: 200 }, (_, i) => `main.c:${i + 1}:1: error: e${i}`).join('\n');
    expect(parseProblems('gcc', out)).toHaveLength(100);
  });
});

describe('ideRunner — rateGate', () => {
  test('allows 20 runs per minute then rejects', () => {
    const user = `ratetest-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      const g = rateGate(user);
      expect(g.allowed).toBe(true);
      g.release();
    }
    expect(rateGate(user).allowed).toBe(false);
  });

  test('caps concurrent runs at 3', () => {
    const user = `conctest-${Date.now()}-${Math.random()}`;
    const gates = [rateGate(user), rateGate(user), rateGate(user)];
    gates.forEach((g) => expect(g.allowed).toBe(true));
    expect(rateGate(user).allowed).toBe(false);
    gates[0].release();
    expect(rateGate(user).allowed).toBe(true);
    gates.forEach((g) => g.release());
  });

  test('release never goes negative', () => {
    const user = `reltest-${Date.now()}-${Math.random()}`;
    const g = rateGate(user);
    expect(g.allowed).toBe(true);
    g.release();
    g.release();
    expect(rateGate(user).allowed).toBe(true);
  });
});

describe('ideRunner — execution (host strategy)', () => {
  let originalStrategy;
  beforeAll(() => {
    originalStrategy = process.env.IDE_EXEC_STRATEGY;
    process.env.IDE_EXEC_STRATEGY = 'host';
  });
  afterAll(() => {
    if (originalStrategy === undefined) delete process.env.IDE_EXEC_STRATEGY;
    else process.env.IDE_EXEC_STRATEGY = originalStrategy;
  });

  test('pickStrategy honors the override', () => {
    expect(pickStrategy()).toBe('host');
  });

  test('bash runs and streams output', async () => {
    const chunks = [];
    const res = await executeRun({
      language: 'bash',
      files: [{ path: 'main.sh', content: 'echo hello-from-bash\necho line-two' }],
      onOutput: (c) => chunks.push(c),
    });
    expect(res.success).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain('hello-from-bash');
    expect(res.output).toContain('line-two');
    expect(chunks.join('')).toContain('hello-from-bash');
    expect(res.backend).toBe('host');
    expect(res.problems).toHaveLength(0);
  }, 20000);

  test('javascript receives args', async () => {
    const res = await executeRun({
      language: 'javascript',
      files: [{ path: 'main.js', content: 'console.log("got:" + process.argv[2])' }],
      args: ['ARG1'],
    });
    expect(res.success).toBe(true);
    expect(res.output).toContain('got:ARG1');
  }, 20000);

  test('python failure yields a parsed problem and no success', async () => {
    const res = await executeRun({
      language: 'python',
      files: [{ path: 'main.py', content: 'print(1/0)' }],
    });
    expect(res.success).toBe(false);
    expect(res.exitCode).not.toBe(0);
    expect(res.problems.length).toBeGreaterThan(0);
    expect(res.problems[0].file).toBe('main.py');
    expect(res.problems[0].message).toContain('ZeroDivisionError');
  }, 20000);

  test('stdin is delivered to the program', async () => {
    const res = await executeRun({
      language: 'python',
      files: [{ path: 'main.py', content: 'import sys; print("read:" + sys.stdin.read().strip())' }],
      stdin: 'STDIN-PAYLOAD',
    });
    expect(res.success).toBe(true);
    expect(res.output).toContain('read:STDIN-PAYLOAD');
  }, 20000);

  test('nonexistent entry is rejected before execution', async () => {
    await expect(executeRun({
      language: 'javascript',
      files: [{ path: 'main.js', content: 'x' }],
      entry: 'other.js',
    })).rejects.toThrow(/Entry file not found/);
  });

  test('unsupported language is rejected', async () => {
    await expect(executeRun({
      language: 'cobol',
      files: [{ path: 'x.cob', content: 'x' }],
    })).rejects.toThrow(/Unsupported language/);
  });

  test('path traversal is rejected', async () => {
    await expect(executeRun({
      language: 'javascript',
      files: [{ path: '../evil.js', content: 'x' }],
    })).rejects.toThrow(/Invalid file path/);
  });

  test('generateRunId returns unique hex ids', () => {
    const a = generateRunId();
    const b = generateRunId();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });

  test('OUTPUT_CAP is 256KB', () => {
    expect(OUTPUT_CAP).toBe(256 * 1024);
  });
});

describe('ide route wiring', () => {
  test('routes/ide loads and exposes expected endpoints', () => {
    const router = require('../routes/ide');
    expect(router).toBeDefined();
    const routes = (router.stack || [])
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(routes).toEqual(expect.arrayContaining([
      'GET /languages',
      'POST /run',
      'GET /run/:runId',
      'GET /run/:runId/stream',
    ]));
  });

  test('ide:run scope exists for all tiers', () => {
    const permissionMatrix = require('../middleware/permissionMatrix');
    expect(permissionMatrix.scopes['ide:run']).toEqual([
      'developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise',
    ]);
  });

  test('server mounts /api/ide', () => {
    const fs = require('fs');
    const src = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    expect(src).toContain("require('./routes/ide')");
    expect(src).toContain("app.use('/api/ide', ideRoutes)");
  });
});
