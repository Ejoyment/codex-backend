/**
 * The editor session mirror in localStorage is plaintext, so credential-style
 * files must never be persisted there. Buffers still work in memory and reload
 * from the server/GitHub; only the local restore is skipped for those files.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KEY = 'buildrs-editor-session-v1';

// buildrs-frontend/lib/editorDrafts.js is ESM and the root Jest config only
// transforms backend CommonJS, so evaluate the module here (same pattern as
// tests/tier-display.test.js). Drop the default-export statement before
// stripping the remaining `export` keywords.
function loadDraftsModule(store) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'buildrs-frontend', 'lib', 'editorDrafts.js'), 'utf8');
  const names = [...source.matchAll(/^export\s+(?:const|function|let|var)\s+(\w+)/gm)].map((m) => m[1]);
  const body = source
    .replace(/^export\s+default\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const context = vm.createContext({ module: { exports: {} }, window: { localStorage }, console });
  vm.runInContext(`${body}\nmodule.exports = { ${names.join(', ')} };`, context);
  return { ...context.module.exports, store };
}

describe('isSecretPath', () => {
  const { isSecretPath } = loadDraftsModule({});

  test.each([
    '.env',
    '.env.local',
    'config/.env.production',
    'github:acme/app@main:deploy/.env',
    'certs/server.pem',
    'deploy/id_rsa',
    'vault/credentials.json',
    'secrets.yaml',
    'ops/service-account.json',
    'tls/keystore.jks',
  ])('%s is treated as secret', (p) => {
    expect(isSecretPath(p)).toBe(true);
  });

  test.each([
    'src/app.js',
    'environment.js',
    'docs/README.md',
    'id_rsa.pub',
    'src/keys.js',
    'tmp:3',
    '507f1f77bcf86cd799439011',
  ])('%s is not treated as secret', (p) => {
    expect(isSecretPath(p)).toBe(false);
  });
});

describe('session mirror scrubbing', () => {
  test('saveSession drops secret-file buffers, including DB files keyed by ObjectId', () => {
    const mod = loadDraftsModule({});
    mod.saveSession({
      contents: {
        '507f1f77bcf86cd799439011': { c: 'PORT=3000', n: '.env', p: '/', s: 'db', t: 1 },
        'github:acme/app@main:src/app.js': { c: 'console.log(1)', n: 'app.js', p: 'src', s: 'gh', t: 2 },
      },
      parked: {
        'github:acme/app@main:deploy/.env': { c: 'TOKEN=shh', n: '.env', p: 'deploy', s: 'gh', t: 3 },
        'parked-ok': { c: 'x', n: 'notes.md', p: '/', s: 'gh', t: 4 },
      },
    });

    const saved = JSON.parse(mod.store[KEY]);
    expect(Object.keys(saved.contents)).toEqual(['github:acme/app@main:src/app.js']);
    expect(Object.keys(saved.parked)).toEqual(['parked-ok']);
  });

  test('loadSession scrubs secret buffers already stored by older versions', () => {
    const store = {
      [KEY]: JSON.stringify({
        contents: {
          'github:acme/app@main:src/app.js': { c: 'ok', o: 'ok', n: 'app.js', s: 'gh' },
          '507f1f77bcf86cd799439011': { c: 'SECRET=1', n: 'credentials.json', s: 'db' },
        },
        parked: { 'y': { c: 'PRIVATE KEY', n: 'id_rsa' } },
      }),
    };
    const mod = loadDraftsModule(store);
    const session = mod.loadSession();
    expect(Object.keys(session.contents)).toEqual(['github:acme/app@main:src/app.js']);
    expect(session.parked).toEqual({});
  });

  test('normal files still round-trip with dirty state intact', () => {
    const mod = loadDraftsModule({});
    mod.saveSession({
      contents: { k1: { c: 'code', o: 'old', n: 'main.py', s: 'db', t: 5 } },
      parked: {},
    });
    const session = mod.loadSession();
    expect(session.contents.k1).toEqual({ c: 'code', o: 'old', n: 'main.py', s: 'db', t: 5 });
    expect(typeof session.updatedAt).toBe('number');
  });
});
