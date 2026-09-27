const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const SSH_HOST = process.env.DEPLOY_SSH_HOST;
const SSH_PORT = parseInt(process.env.DEPLOY_SSH_PORT || '22');
const SSH_USER = process.env.DEPLOY_SSH_USER || 'deployer';
const DOMAIN = process.env.DEPLOY_DOMAIN || 'buildrshq.dev';
const DEPLOY_SUBDIR = (process.env.DEPLOY_ROOT || 'deployments').replace(/^\/+/, '').replace(/^~\/?/, '');
const DEPLOY_TIMEOUT_MS = parseInt(process.env.DEPLOY_TIMEOUT_MS) || 900000;

function getRawKey() {
  if (process.env.DEPLOY_SSH_KEY) return process.env.DEPLOY_SSH_KEY;
  const keyFilePath = process.env.DEPLOY_SSH_KEY_FILE;
  if (keyFilePath) {
    try { return fs.readFileSync(keyFilePath, 'utf8'); } catch (_) {}
  }
  return null;
}

let keyFile = null;
let homeDirCache = null;

async function getHomeDir() {
  if (homeDirCache) return homeDirCache;
  try {
    const out = await sshExec('echo $HOME');
    homeDirCache = (out.trim() || '/home/deployer').replace(/\/+$/, '');
  } catch (_) {
    homeDirCache = '/home/deployer';
  }
  return homeDirCache;
}

async function findWritableBase() {
  if (!SSH_HOST) throw new Error('DEPLOY_SSH_HOST env not set');
  const homeDir = await getHomeDir();
  const candidates = [
    `${homeDir}/deployments`,
    `${homeDir}/${DEPLOY_SUBDIR}`,
    '/var/tmp/deployments',
    '/tmp/deployments',
  ];
  for (const dir of candidates) {
    try {
      await sshExec(`mkdir -p ${dir} && touch ${dir}/.writetest && rm -f ${dir}/.writetest`);
      return dir;
    } catch (_) {}
  }
  throw new Error(
    'No writable deployment directory found on the VPS. ' +
    `Tried: ${candidates.join(', ')}. ` +
    'Ensure the SSH user can write to its home directory or /var/tmp.'
  );
}

function getKeyFile() {
  if (keyFile) return keyFile;
  const rawKey = getRawKey();
  if (!rawKey) throw new Error('DEPLOY_SSH_KEY env not set');

  let key = rawKey;
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('-----BEGIN')) {
    const b64 = key.replace(/[\r\n\s]+/g, '');
    key = '-----BEGIN OPENSSH PRIVATE KEY-----\n' + b64 + '\n-----END OPENSSH PRIVATE KEY-----\n';
  }
  if (!key.endsWith('\n')) key += '\n';

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-key-'));
  const file = path.join(dir, 'id_key');
  fs.writeFileSync(file, key, { mode: 0o600 });
  keyFile = file;
  return file;
}

function sshExec(command, input = null) {
  return new Promise((resolve, reject) => {
    try {
      if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));
      const key = getKeyFile();
      const sshCmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} ${JSON.stringify(command)}`;
      const opts = { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' };
      const proc = exec(sshCmd, opts);

      if (input) proc.stdin.end(input);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; });

      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(stderr || `Process exited with code ${code}`));
        resolve(stdout.trim());
      });
      proc.on('error', err => {
        if (err.killed) return reject(new Error('SSH command killed: timeout exceeded'));
        reject(new Error((err.stderr || err.stdout || err.message || '').toString().trim()));
      });
    } catch (err) {
      reject(new Error(err.message || 'SSH command failed'));
    }
  });
}


// ---------------------------------------------------------------------------
// Runtime detection & Dockerfile generation
//
// detectRuntime(files) returns:
//   runtime    - 'node' | 'python' | 'go' | 'ruby' | 'php' | 'static' | 'docker'
//   dockerfile - generated template text, or the user's own Dockerfile text
//                when runtime === 'docker'
//   exposePort - container port advertised to traefik
//   contextDir - repo-relative docker build context ('.' = repo root)
//
// Markers are matched ROOT-FIRST so a monorepo's nested app never hijacks a
// root project. A nested match (e.g. gateway/Dockerfile, gateway/go.mod) sets
// contextDir to its own directory; the build then runs
// `docker build -f <dir>/Dockerfile <dir>` so COPY statements resolve inside
// the app dir instead of the repo root — aegis-ai failed with
// `COPY go.mod go.sum ./` → "/go.sum": not found when its nested
// gateway/Dockerfile was hoisted to the repo root.
// ---------------------------------------------------------------------------

// First path segment that usually marks the real app dir in a monorepo.
const APP_DIR_PRIORITY = ['app', 'api', 'server', 'backend', 'gateway', 'service', 'src', 'web', 'frontend', 'client'];
// Deps that compile native addons: node:alpine needs python3/make/g++.
const NATIVE_DEP_RE = /node-pty|bcrypt|sharp|canvas|better-sqlite3|sqlite3|serialport|epoll|bufferutil|utf-8-validate|node-sass|grpc|re2|leveldown|classic-level|node-gyp|prebuild/;
// Files whose presence marks a directory as the deployable app (Dockerfile scoring).
const APP_MANIFESTS = ['package.json', 'requirements.txt', 'go.mod', 'gemfile', 'composer.json', 'pom.xml', 'cargo.toml'];
// Signals that a nested package.json directory is the real app root.
const NESTED_PKG_SIGNALS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'dockerfile'];

function fileText(f) {
  return f && f.encoding === 'base64'
    ? Buffer.from(String(f.content || ''), 'base64').toString('utf8')
    : String((f && f.content) || '');
}

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function clampPort(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

function detectRuntime(files) {
  // `rel` keeps original case for filesystem use; `key`/`dirKey`/`name` are
  // lowercased for case-insensitive marker matching.
  const entries = [];
  for (const f of files) {
    const rel = buildFileRelPath(f);
    const slash = rel.lastIndexOf('/');
    const dir = slash === -1 ? '' : rel.slice(0, slash);
    entries.push({
      f,
      rel,
      dir,
      key: rel.toLowerCase(),
      dirKey: dir.toLowerCase(),
      name: (slash === -1 ? rel : rel.slice(slash + 1)).toLowerCase(),
    });
  }
  const textCache = new Map();
  const text = e => {
    if (!textCache.has(e)) textCache.set(e, fileText(e.f));
    return textCache.get(e);
  };
  const inRoot = name => entries.find(e => e.dirKey === '' && e.name === name);
  const findIn = (dirKey, name) => entries.find(e => e.dirKey === dirKey && e.name === name);
  // Path of `e` relative to its context dir (what a Dockerfile COPY uses).
  const ctxRelOf = (e, dir) => (dir ? e.rel.slice(dir.length + 1) : e.rel);
  const dirRank = dir => {
    const i = APP_DIR_PRIORITY.indexOf(dir.split('/')[0].toLowerCase());
    return i === -1 ? APP_DIR_PRIORITY.length : i;
  };
  // Pick the most app-like directory: explicit flag first, then well-known
  // app dir names (app/api/.../gateway/.../client), then alphabetical.
  const pickDir = (cands, flagFn) => {
    const ranked = cands.map(e => ({ e, flag: flagFn ? !!flagFn(e) : false }));
    ranked.sort((a, b) =>
      (a.flag === b.flag ? 0 : a.flag ? -1 : 1) ||
      (dirRank(a.e.dir) - dirRank(b.e.dir)) ||
      (a.e.key < b.e.key ? -1 : a.e.key > b.e.key ? 1 : 0));
    return ranked[0].e;
  };
  const shallowest = cands => cands.slice().sort((a, b) =>
    (a.key.split('/').length - b.key.split('/').length) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0];

  // Static nginx image (two variants: custom conf or a generated default
  // conf). ensureStaticEntry() guarantees a root index.html exists in the
  // file set *before* the build (copied from the project's own index.html,
  // or a generated file listing with HTML-escaped / URL-encoded names) — the
  // old in-image shell listing broke on spaces, unicode and quotes in
  // filenames. Context is always the repo root so generated entries land
  // inside the build context.
  const staticResult = (confRel = null) => ({
    runtime: 'static',
    exposePort: 80,
    contextDir: '.',
    dockerfile: confRel
      ? `FROM nginx:alpine
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY ${confRel} /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
EXPOSE 80
`
      : `FROM nginx:alpine
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY . /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html index.htm; location ~* \\.[^/]+\$ { try_files \$uri =404; } location / { try_files \$uri \$uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
`,
  });

  const dockerResult = (e, dir) => {
    const m = /^\s*EXPOSE\s+(\d+)/im.exec(text(e));
    return {
      runtime: 'docker',
      dockerfile: text(e),
      exposePort: (m && clampPort(m[1])) || 80,
      contextDir: dir || '.',
    };
  };

  const phpResult = dir => ({
    runtime: 'php',
    exposePort: 80,
    contextDir: dir || '.',
    dockerfile: `FROM php:8.2-apache
RUN rm -f /var/www/html/index.html /var/www/html/index.php
COPY . /var/www/html
EXPOSE 80
`,
  });

  const pythonResult = dir => {
    const dk = dir.toLowerCase();
    const entry = ['manage.py', 'app.py', 'main.py', 'server.py', 'run.py']
      .map(n => findIn(dk, n)).find(Boolean);
    // No recognizable entry: serve the files instead of building a dead image.
    if (!entry) return staticResult();
    const manage = entry.name === 'manage.py';
    let port = 8000;
    if (!manage) {
      const t = text(entry);
      const pm = t.match(/\.PORT\s*\|\|\s*(\d{4,5})/) || t.match(/listen\(\s*(\d{4,5})/) || t.match(/\bport\s*=\s*(\d{4,5})/i);
      if (pm) port = clampPort(pm[1]) || 8000;
    }
    const entryRel = ctxRelOf(entry, dir);
    const cmd = manage
      ? `CMD ["python", ${JSON.stringify(entryRel)}, "runserver", "0.0.0.0:${port}"]`
      : `CMD ["python", ${JSON.stringify(entryRel)}]`;
    const req = findIn(dk, 'requirements.txt');
    const reqRel = req ? ctxRelOf(req, dir) : 'requirements.txt';
    return {
      runtime: 'python',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM python:3.11-slim
WORKDIR /app
COPY "${reqRel}" ./
RUN pip install --no-cache-dir -r "${reqRel}"
COPY . .
EXPOSE ${port}
ENV PORT=${port}
${cmd}
`,
    };
  };

  const goResult = dir => {
    const dk = dir.toLowerCase();
    const under = e => !dir || e.key.startsWith(dk + '/');
    const goFiles = entries.filter(e => e.name.endsWith('.go') && under(e));
    const mainFiles = goFiles.filter(e => /\bpackage\s+main\b/.test(text(e)));
    // A module without a main package has nothing to run: serve the files.
    if (!mainFiles.length) return staticResult();
    let pkg = '.';
    if (!mainFiles.some(e => e.dirKey === dk)) {
      const mainDirs = [...new Set(mainFiles.map(e => e.dirKey))].sort();
      const cmdDir = mainDirs.find(d => d.startsWith((dk ? dk + '/' : '') + 'cmd/'));
      const chosen = cmdDir || mainDirs[0];
      pkg = './' + (dir ? chosen.slice(dir.length + 1) : chosen);
    }
    const goMod = findIn(dk, 'go.mod');
    const goSum = findIn(dk, 'go.sum');
    let goVer = 22;
    if (goMod) {
      const vm = /^go\s+1\.(\d+)\s*$/m.exec(text(goMod));
      if (vm) {
        const n = parseInt(vm[1], 10);
        if (Number.isInteger(n) && n >= 21) goVer = n;
      }
    }
    let port = 8080;
    for (const mf of mainFiles) {
      const am = text(mf).match(/"[:](\d{4,5})"/);
      if (am) {
        const p = clampPort(am[1]);
        if (p) { port = p; break; }
      }
    }
    const copyLine = `COPY ${goMod ? ctxRelOf(goMod, dir) : 'go.mod'}${goSum ? ' ' + ctxRelOf(goSum, dir) : ''} ./`;
    return {
      runtime: 'go',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM golang:1.${goVer}-alpine AS build
WORKDIR /src
${copyLine}
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 go build -o /out/app ${pkg}

FROM alpine:3.19
RUN apk add --no-cache ca-certificates git
COPY --from=build /out/app /usr/local/bin/app
EXPOSE ${port}
ENV PORT=${port}
CMD ["app"]
`,
    };
  };

  const rubyResult = dir => {
    const dk = dir.toLowerCase();
    const gemfile = findIn(dk, 'gemfile');
    const gemLock = findIn(dk, 'gemfile.lock');
    const copyLine = `COPY ${gemfile ? ctxRelOf(gemfile, dir) : 'Gemfile'}${gemLock ? ' ' + ctxRelOf(gemLock, dir) : ''} ./`;
    return {
      runtime: 'ruby',
      exposePort: 3000,
      contextDir: dir || '.',
      dockerfile: `FROM ruby:3.2-alpine
WORKDIR /app
${copyLine}
RUN bundle install
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`,
    };
  };

  const nodeResult = dir => {
    const dk = dir.toLowerCase();
    const pkgEntry = findIn(dk, 'package.json');
    const pkg = (pkgEntry && parseJsonSafe(text(pkgEntry))) || {};
    const scripts = (pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)) ? pkg.scripts : {};
    // Only THIS package.json's scripts.build decides a build step — the old
    // code substring-matched '"build"' in any package.json (buildrs-frontend
    // hijacked the root app and emitted a doomed `npm run build`).
    const hasBuild = typeof scripts.build === 'string' && scripts.build.trim().length > 0;

    // engines.node: first declared major, floored at 20, snapped to an even
    // (LTS) major, capped at 24. No/odd engines → node:20-alpine.
    let nodeMajor = 20;
    if (pkg.engines && typeof pkg.engines.node === 'string') {
      const em = pkg.engines.node.match(/(\d+)/);
      if (em) {
        let v = parseInt(em[1], 10);
        if (Number.isInteger(v)) {
          if (v < 20) v = 20;
          if (v % 2 === 1) v += 1;
          if (v > 24) v = 24;
          nodeMajor = v;
        }
      }
    }

    const depNames = [];
    for (const b of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]) {
      if (b && typeof b === 'object') depNames.push(...Object.keys(b));
    }
    // Native addons (node-pty, bcrypt, sharp, ...) need python3/make/g++ on
    // alpine or `npm install` dies with "gyp ERR! find Python".
    const native = NATIVE_DEP_RE.test(depNames.join(' '))
      || NATIVE_DEP_RE.test(Object.values(scripts).filter(v => typeof v === 'string').join(' '))
      || !!findIn(dk, 'binding.gyp');

    const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']
      .filter(n => findIn(dk, n));
    const hasNpmLock = locks.includes('package-lock.json') || locks.includes('npm-shrinkwrap.json');
    const omit = hasBuild ? '' : ' --omit=dev';
    const install = hasNpmLock
      ? `RUN npm ci --no-audit --no-fund${omit} || npm install --no-audit --no-fund${omit}`
      : `RUN npm install --no-audit --no-fund${omit}`;
    const copyLine = `COPY package.json${locks.length ? ' ' + locks.join(' ') : ''} ./`;

    const start = typeof scripts.start === 'string' ? scripts.start.trim() : '';
    const rootEntryName = ['server.js', 'app.js', 'index.js', 'main.js'].find(n => findIn(dk, n));
    let cmd = null;
    let entryFile = null;
    const startNode = start.match(/^node\s+([^\s;&|]+)/);
    if (startNode) {
      entryFile = startNode[1].replace(/^\.\//, '');
      cmd = `CMD ["node", ${JSON.stringify(entryFile)}]`;
    } else if (start) {
      cmd = 'CMD ["npm", "start"]';
      entryFile = rootEntryName || null;
    } else if (rootEntryName) {
      entryFile = rootEntryName;
      cmd = `CMD ["node", ${JSON.stringify(rootEntryName)}]`;
    } else if (typeof pkg.main === 'string' && pkg.main.trim()) {
      const main = pkg.main.trim().replace(/^\.\//, '');
      const wanted = [main, main.endsWith('.js') ? main : main + '.js']
        .map(c => (dir ? dir + '/' + c : c).toLowerCase());
      const found = entries.find(e => wanted.includes(e.key));
      if (found) {
        entryFile = ctxRelOf(found, dir);
        cmd = `CMD ["node", ${JSON.stringify(entryFile)}]`;
      } else if (/\.js$/i.test(main)) {
        entryFile = main;
        cmd = `CMD ["node", ${JSON.stringify(main)}]`;
      }
    }
    // package.json without a runnable entry: serve the files instead.
    if (!cmd) return staticResult();

    let port = 3000;
    const startPort = start.match(/(?:^|\s)(?:-p|--port)(?:=|\s+)(\d{2,5})/) || start.match(/\bPORT=(\d{2,5})/);
    if (startPort) {
      port = clampPort(startPort[1]) || 3000;
    } else if (entryFile) {
      const ef = entries.find(e => e.key === (dir ? dir + '/' + entryFile : entryFile).toLowerCase());
      if (ef) {
        const t = text(ef);
        const pm = t.match(/\.PORT\s*\|\|\s*(\d{4,5})/) || t.match(/\.listen\(\s*(\d{4,5})/) || t.match(/\bport\s*=\s*(\d{4,5})/i);
        if (pm) port = clampPort(pm[1]) || 3000;
      }
    }

    return {
      runtime: 'node',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM node:${nodeMajor}-alpine
${native ? 'RUN apk add --no-cache python3 make g++ libc6-compat\n' : ''}WORKDIR /app
${copyLine}
${install}
COPY . .
${hasBuild ? 'RUN npm run build\nRUN npm prune --omit=dev || true\n' : ''}EXPOSE ${port}
ENV PORT=${port}
${cmd}
`,
    };
  };

  // Root-first marker chain. Root markers (design order) always beat nested
  // ones so a monorepo subdir never hijacks the root project.
  const rootDockerfile = inRoot('dockerfile');
  if (rootDockerfile) return dockerResult(rootDockerfile, '');
  if (inRoot('package.json')) return nodeResult('');
  if (inRoot('requirements.txt')) return pythonResult('');
  if (inRoot('go.mod')) return goResult('');
  if (inRoot('gemfile')) return rubyResult('');
  const rootNginx = inRoot('nginx.conf');
  if (rootNginx) return staticResult(ctxRelOf(rootNginx, ''));
  if (entries.some(e => e.dirKey === '' && e.name.endsWith('.php'))) return phpResult('');
  if (entries.some(e => e.dirKey === '' && e.name.endsWith('.html'))) return staticResult();

  // Nested markers: build ONLY from the app dir (`docker build -f <dir>/Dockerfile <dir>`).
  const nestedDockerfiles = entries.filter(e => e.dirKey !== '' && e.name === 'dockerfile');
  if (nestedDockerfiles.length) {
    const best = pickDir(nestedDockerfiles, e => APP_MANIFESTS.some(n => findIn(e.dirKey, n)));
    return dockerResult(best, best.dir);
  }
  const nestedPkgs = entries.filter(e => e.dirKey !== '' && e.name === 'package.json');
  if (nestedPkgs.length) {
    const best = pickDir(nestedPkgs, e => NESTED_PKG_SIGNALS.some(n => findIn(e.dirKey, n)));
    return nodeResult(best.dir);
  }
  const nestedReqs = entries.filter(e => e.dirKey !== '' && e.name === 'requirements.txt');
  if (nestedReqs.length) return pythonResult(pickDir(nestedReqs).dir);
  const nestedGoMods = entries.filter(e => e.dirKey !== '' && e.name === 'go.mod');
  if (nestedGoMods.length) return goResult(pickDir(nestedGoMods).dir);

  const anyNginx = entries.filter(e => e.name === 'nginx.conf');
  if (anyNginx.length) return staticResult(shallowest(anyNginx).rel);
  const phpFiles = entries.filter(e => e.name.endsWith('.php'));
  if (phpFiles.length) return phpResult(shallowest(phpFiles).dir);
  if (entries.some(e => e.name.endsWith('.html'))) return staticResult();
  return staticResult();
}

// Build the archive-relative path for a file. `f.path` may be a directory
// ('/', 'src') or a full path that already includes the filename
// ('/game.html' from the GitHub tree API, '/name' from editor saves).
// Joining blindly produced nested paths like 'game.html/game.html'.
function buildFileRelPath(f) {
  const dir = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!dir) return f.name;
  if (dir === f.name || dir.endsWith('/' + f.name)) return dir;
  return path.join(dir, f.name);
}

// Guarantee a static deployment has a root index.html, computed on the client
// side so filenames with spaces/unicode/quotes get properly URL-encoded and
// HTML-escaped (the old in-image shell listing emitted raw hrefs and broke).
// `entries` use archive-relative paths (see buildFileRelPath output).
function ensureStaticEntry(entries) {
  const rel = e => String(e.path || '').replace(/^\//, '');
  if (entries.some(e => rel(e) === 'index.html')) return entries;

  const rootHtml = entries.filter(e => !rel(e).includes('/') && rel(e).toLowerCase().endsWith('.html'));
  if (rootHtml.length === 1) {
    return [...entries, {
      name: 'index.html',
      path: 'index.html',
      content: rootHtml[0].content || '',
      encoding: rootHtml[0].encoding,
    }];
  }

  const items = entries
    .map(e => rel(e))
    .filter(r => r !== 'Dockerfile' && r !== '.dockerignore')
    .sort()
    .map(r => {
      const href = r.split('/').map(encodeURIComponent).join('/');
      const label = r.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<li><a href="/${href}">${label}</a></li>`;
    })
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deployed files</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#111}h1{font-size:20px;font-weight:600}li{margin:8px 0}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>Deployed files</h1><ul>${items}</ul></body></html>`;
  return [...entries, { name: 'index.html', path: 'index.html', content: html }];
}

// .dockerignore for the build context. dist/ and build/ are deliberately NOT
// ignored: static sites that ship prebuilt output (or Node apps serving a
// checked-in dist/) would deploy empty if we dropped them. node_modules and
// the rest are safe to exclude for every runtime.
function dockerIgnoreFor() {
  return [
    'node_modules', 'npm-debug.log', '.git', '.env', '.env.*',
    '__pycache__', '*.pyc', '*.pyo', '*.log', 'coverage', '.nyc_output',
    '.venv', 'venv', 'Dockerfile', '.dockerignore', '',
  ].join('\n');
}

function createTarballSync(files) {
  const tarPath = path.join(os.tmpdir(), `deploy-${Date.now()}.tar.gz`);
  const tmpDir = path.join(os.tmpdir(), `deploy-src-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const file of files) {
    const relPath = file.path.replace(/^\//, '');
    assertSafeRelPath(relPath);
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    // Binary files carry base64 content + encoding flag; utf8 round-tripping
    // them would corrupt images/fonts/wasm.
    const buf = file.encoding === 'base64'
      ? Buffer.from(String(file.content || ''), 'base64')
      : Buffer.from(String(file.content || ''), 'utf8');
    fs.writeFileSync(fullPath, buf);
  }
  try {
    // COPYFILE_DISABLE: don't add macOS AppleDouble (._*) junk that breaks re-extraction
    execSync(`tar -czf '${tarPath}' -C '${tmpDir}' .`, {
      env: { ...process.env, COPYFILE_DISABLE: '1' }
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Failed to create tarball');
  }
  return tarPath;
}

async function deployProject(subdomain, files) {
  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!sanitizedSubdomain || sanitizedSubdomain.length < 2) {
    throw new Error('Subdomain must be at least 2 characters');
  }

  const deployBase = await findWritableBase();
  const deploymentDir = `${deployBase}/${sanitizedSubdomain}`;
  const containerName = `deploy-${sanitizedSubdomain}`;
  const nextContainerName = `${containerName}-next-${Date.now()}`;
  const imageTag = `${containerName}:${Date.now()}`;

  const { runtime, dockerfile, exposePort, contextDir } = detectRuntime(files);
  const contextRel = String(contextDir || '.').replace(/^\.?\/+/, '').replace(/\/+$/, '') || '.';
  const buildDir = contextRel === '.' ? deploymentDir : `${deploymentDir}/${contextRel}`;
  console.log(`[deploy] Runtime: ${runtime}, port: ${exposePort}, context: ${contextRel}, dir: ${deploymentDir}`);

  // Rebuild the directory from scratch: stale paths from a prior deploy (e.g.
  // directories created by the old double-path bug) break extraction and writes.
  await sshExec(`rm -rf '${deploymentDir}' && mkdir -p '${deploymentDir}'`);


  let fileEntries = files.map(f => ({
    name: f.name,
    path: buildFileRelPath(f),
    content: typeof f.content === 'string' ? f.content : (f.content || ''),
    encoding: f.encoding === 'base64' ? 'base64' : undefined,
  }));
  // Static deployments need a root entry page; generate it here (before the
  // tarball) so odd filenames survive HTML/URL escaping correctly.
  if (runtime === 'static') fileEntries = ensureStaticEntry(fileEntries);
  // Validate before tarball + fallback: blocks local tmpDir escape,
  // Tar Slip on the VPS, and remote-path breakout.
  for (const file of fileEntries) {
    assertSafeRelPath(file.path);
  }

  try {
    const tarPath = createTarballSync(fileEntries);
    const tarB64 = Buffer.from(fs.readFileSync(tarPath)).toString('base64');
    await writeRemoteFile(`${deploymentDir}/deploy.tar.gz`, tarB64, true);
    await sshExec(`cd '${deploymentDir}' && tar -xzf deploy.tar.gz && rm deploy.tar.gz`);
    fs.unlinkSync(tarPath);
    const fileCount = await sshExec(`find ${deploymentDir} -type f | wc -l`).catch(() => '0');
    const fileList = await sshExec(`ls ${deploymentDir}`).catch(() => '');
    console.log(`[deploy] ${fileCount.trim()} files in ${deploymentDir}: ${fileList}`);
  } catch (tarErr) {
    console.error(`[deploy] Tarball failed: ${tarErr.message}`);
    for (const file of fileEntries) {
      const relPath = file.path.replace(/^\//, '');
      await writeRemoteFile(`${deploymentDir}/${relPath}`, file.content || '', file.encoding === 'base64');
    }
  }

  // Write the Dockerfile and .dockerignore AFTER extraction: a repo file can
  // never clobber the one we build with, and the file is present even if the
  // per-file fallback above stopped early. For nested contexts both live
  // inside the context dir — the build runs `docker build -f <ctx>/Dockerfile <ctx>`
  // so COPY statements resolve inside the app dir (aegis-ai monorepo fix).
  if (dockerfile) {
    await writeRemoteFile(`${buildDir}/Dockerfile`, dockerfile);
  }
  const dockerignoreRel = (contextRel === '.' ? '.dockerignore' : `${contextRel}/.dockerignore`).toLowerCase();
  const hasDockerignore = files.some(f => buildFileRelPath(f).toLowerCase() === dockerignoreRel);
  if (!hasDockerignore) {
    await writeRemoteFile(`${buildDir}/.dockerignore`, dockerIgnoreFor());
  }

  await sshExec(`docker build --force-rm --no-cache -t ${imageTag} -f ${shq(`${buildDir}/Dockerfile`)} ${shq(buildDir)}`).catch(async err => {
    const ctxList = await sshExec(`ls -la ${shq(buildDir)} 2>/dev/null || echo 'DIR_MISSING'`).catch(() => 'DIR_MISSING');
    const rootList = contextRel === '.'
      ? ''
      : ` Repo root: ${await sshExec(`ls -la ${shq(deploymentDir)} 2>/dev/null || echo 'DIR_MISSING'}`).catch(() => 'DIR_MISSING')}`;
    throw new Error(`Docker build failed (${runtime}, context '${contextRel}'): ${err.message}. Context contents: ${ctxList}.${rootList}`);
  });

  const imageFiles = await sshExec(`docker run --rm --entrypoint ls ${imageTag} /usr/share/nginx/html/ 2>/dev/null || echo 'NO_FILES'`).catch(() => 'NO_FILES');
  console.log(`[deploy] Image files: ${imageFiles}`);

  const existingContainer = (await sshExec(`docker ps -q --filter "name=${containerName}" 2>/dev/null || true`).catch(() => '')).trim();

  const runScript = `#!/bin/bash
docker rm -f ${nextContainerName} 2>/dev/null || true
docker run -d \\
  --name ${nextContainerName} \\
  --restart unless-stopped \\
  --cap-drop ALL \\
  --cap-add CHOWN \\
  --cap-add SETUID \\
  --cap-add SETGID \\
  --cap-add DAC_OVERRIDE \\
  --cap-add FOWNER \\
  --cap-add NET_BIND_SERVICE \\
  --security-opt no-new-privileges \\
  --memory 512m \\
  --cpus 1 \\
  --pids-limit 100 \\
  --label 'traefik.enable=true' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.rule=Host(\`${sanitizedSubdomain}.${DOMAIN}\`) || Host(\`www.${sanitizedSubdomain}.${DOMAIN}\`)' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.entrypoints=websecure' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.tls.certresolver=letsencrypt' \\
  --label 'traefik.http.services.${sanitizedSubdomain}.loadbalancer.server.port=${exposePort}' \\
  ${imageTag}
`;

  await writeRemoteFile(`${deploymentDir}/run.sh`, runScript);
  const nextContainerId = (await sshExec(`bash ${deploymentDir}/run.sh`)).trim();

  if (existingContainer) {
    await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
  }

  await sshExec(`docker rename ${nextContainerName} ${containerName}`).catch(async (renameErr) => {
    console.warn('[deploy] rename to active container failed, leaving standby container:', renameErr.message);
    await sshExec(`docker rm -f ${nextContainerName} 2>/dev/null || true`);
    throw renameErr;
  });

  console.log(`[deploy] ${containerName} started (${nextContainerId}) using blue-green swap`);

  try { await sshExec(`docker image prune -f 2>/dev/null || true`); } catch (_) {}

  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const health = await sshExec(`docker inspect --format='{{.State.Running}}' ${containerName} 2>/dev/null || echo 'false'`);
    if (health !== 'true') {
      throw new Error('Container is not running after deployment');
    }
    console.log(`[deploy] ${containerName} health check passed`);
  } catch (healthErr) {
    console.warn('[deploy] Health check issue:', healthErr.message);
  }

  try {
    const containerFiles = await sshExec(`docker exec ${containerName} ls /usr/share/nginx/html/ 2>/dev/null || echo 'N/A'`).catch(() => 'N/A');
    console.log(`[deploy] Container nginx files: ${containerFiles}`);
    const indexCheck = await sshExec(`docker exec ${containerName} cat /usr/share/nginx/html/index.html 2>/dev/null | head -1 || echo 'NO_INDEX'`).catch(() => 'NO_INDEX');
    console.log(`[deploy] index.html content check: ${indexCheck}`);
    const curlCheck = await sshExec(`docker exec ${containerName} curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo 'CURL_FAILED'`).catch(() => 'CURL_FAILED');
    console.log(`[deploy] HTTP status check: ${curlCheck}`);
    const labelsCheck = await sshExec(`docker inspect ${containerName} --format '{{json .Config.Labels}}' 2>/dev/null || echo 'LABELS_FAILED'`).catch(() => 'LABELS_FAILED');
    console.log(`[deploy] Container labels: ${labelsCheck}`);
  } catch (checkErr) {
    console.warn('[deploy] File check issue:', checkErr.message);
  }

  return { containerId: nextContainerId, url: `https://${sanitizedSubdomain}.${DOMAIN}` };
}

async function writeRemoteFile(remotePath, content, isBase64 = false) {
  if (remotePath.includes('..') || remotePath.includes('\n') || /[\u0000-\u001f\u007f\\$`]/.test(remotePath)) {
    throw new Error('Invalid remote path');
  }
  const encoded = isBase64 ? content : Buffer.from(content || '').toString('base64');
  const parentDir = remotePath.includes('/')
    ? remotePath.slice(0, remotePath.lastIndexOf('/'))
    : '.';
  await sshExec(`mkdir -p ${shq(parentDir)}`);
  await sshExec(`cat | base64 -d > ${shq(remotePath)}`, encoded);
}

// Single-quote a value for the remote shell. sshExec wraps the whole command
// in JSON double quotes, which the local shell passes through literally, so
// the remote shell only ever sees our single-quoted tokens — apostrophes,
// spaces and unicode survive, and `$`/backtick (rejected by
// assertSafeRelPath) can never be expanded by either shell.
function shq(s) {
  return `'` + String(s).replace(/'/g, `'\"'\"'`) + `'`;
}

// Shared validation: every file path segment must be a safe, single-level
// name. Protects local tmpDir writes, tarball entries (Tar Slip on the VPS),
// and the per-file remote fallback.
//
// Real-world names — spaces, unicode, parentheses, '@+#~,()[]' — are allowed.
// Rejected: traversal ('.', '..'), empty segments (e.g. 'a//b', leading '/'),
// control characters, and the characters that would be expanded by the local
// shell wrapping ssh commands (`$`, backtick) or break remote writes ('\').
// Segments must fit the 255-byte filesystem name limit.
function assertSafeRelPath(relPath) {
  const raw = String(relPath == null ? '' : relPath);
  if (!raw || raw.length > 4096) throw new Error('Invalid file path');
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.' || segment === '..') throw new Error('Invalid file path');
    if (/[\u0000-\u001f\u007f\\$`]/.test(segment)) throw new Error(`Invalid file path: unsafe character in "${segment}"`);
    if (Buffer.byteLength(segment, 'utf8') > 255) throw new Error(`Invalid file path: name too long in "${segment.slice(0, 50)}..."`);
  }
}

async function stopDeployment(subdomain) {
  const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const containerName = `deploy-${sanitized}`;
  try {
    await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
    // Images are tagged deploy-<sub>:<ts>; `docker rmi deploy-<sub>` alone
    // targets a nonexistent :latest, so resolve the real ids first.
    const imgIds = (await sshExec(`docker images -q ${containerName} 2>/dev/null || true`).catch(() => '')).trim();
    if (imgIds) {
      await sshExec(`docker rmi ${imgIds.split(/\s+/).join(' ')} 2>/dev/null || true`);
    }
    // Remove the build dir from the SAME base deployProject resolved —
    // findWritableBase falls back to /var/tmp/deployments when the SSH
    // user's home is not writable, and removing only the home path left
    // stale build dirs behind on the VPS.
    try {
      const base = await findWritableBase();
      await sshExec(`rm -rf ${shq(`${base}/${sanitized}`)}`);
    } catch (_) {}
    const homeDir = await getHomeDir();
    await sshExec(`rm -rf ${shq(`${homeDir}/${DEPLOY_SUBDIR}/${sanitized}`)} 2>/dev/null || true`);
  } catch (_) {}
}

async function isSubdomainTaken(subdomain) {
  const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  try {
    const out = await sshExec(`docker ps -a --filter "name=deploy-${sanitized}" --format "{{.Names}}"`);
    return out.trim().length > 0;
  } catch (_) { return false; }
}

module.exports = {
  sshExec,
  writeRemoteFile,
  detectRuntime,
  deployProject,
  stopDeployment,
  isSubdomainTaken,
  createTarballSync,
  assertSafeRelPath,
  buildFileRelPath,
  ensureStaticEntry,
  shq,
};
