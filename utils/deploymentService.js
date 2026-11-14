const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { toEnvObject } = require('./deployEnv');

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

function sshArgs(command) {
  const key = getKeyFile();
  return [
    '-i', key,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ConnectTimeout=20',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-p', String(SSH_PORT),
    `${SSH_USER}@${SSH_HOST}`,
    command,
  ];
}

// Run a command over SSH. Uses spawn (not exec) so a long docker build can
// stream its output without Node buffering the whole log or enforcing
// exec's maxBuffer, which used to kill large builds with ENOMEM/ERR_CHILD.
function sshExec(command, input = null, onData = null) {
  return new Promise((resolve, reject) => {
    if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));

    let proc;
    try {
      proc = spawn('ssh', sshArgs(String(command)), { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(new Error(err.message || 'SSH command failed'));
    }

    // Keep a bounded copy for error messages; streaming consumers still get
    // every chunk through onData.
    const MAX_BUFFER = 8 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (current, chunk) => (
      current.length >= MAX_BUFFER ? current : current + chunk.slice(0, MAX_BUFFER - current.length)
    );

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch (_) {}
      reject(new Error('SSH command killed: timeout exceeded'));
    }, DEPLOY_TIMEOUT_MS);

    proc.stdin.on('error', () => {});
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout = append(stdout, text);
      if (onData) onData(text);
    });
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr = append(stderr, text);
      if (onData) onData(text);
    });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(err.message || 'SSH command failed'));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
      resolve(stdout.trim());
    });

    if (input !== null && input !== undefined) proc.stdin.end(input);
    else proc.stdin.end();
  });
}

function assertSafeRemotePath(remotePath) {
  if (remotePath.includes('..') || remotePath.includes('\n') || /[\u0000-\u001f\u007f\\$`]/.test(remotePath)) {
    throw new Error('Invalid remote path');
  }
}

// Stream a local file to the VPS. Used for the deployment tarball so a
// multi-gigabyte repository is never base64-encoded into the Node heap.
async function sshUploadFile(localPath, remotePath) {
  assertSafeRemotePath(remotePath);
  const parentDir = remotePath.includes('/')
    ? remotePath.slice(0, remotePath.lastIndexOf('/'))
    : '.';
  await sshExec(`mkdir -p ${shq(parentDir)}`);

  await new Promise((resolve, reject) => {
    if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));

    let proc;
    try {
      proc = spawn('ssh', sshArgs(`cat > ${shq(remotePath)}`), { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(new Error(err.message || 'SSH upload failed'));
    }

    let stderr = '';
    let settled = false;
    let timer = null;
    const stream = fs.createReadStream(localPath);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { stream.destroy(); } catch (_) {}
      try { proc.kill('SIGKILL'); } catch (_) {}
      fn(value);
    };
    timer = setTimeout(() => {
      finish(reject, new Error('SSH upload killed: timeout exceeded'));
    }, DEPLOY_TIMEOUT_MS);

    stream.on('error', (err) => finish(reject, err));
    proc.stdin.on('error', () => {});
    proc.stderr.on('data', (data) => {
      if (stderr.length < 1024 * 1024) stderr += data.toString();
    });
    proc.on('error', (err) => finish(reject, new Error(err.message || 'SSH upload failed')));
    proc.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        return finish(reject, new Error(stderr.trim() || `SSH upload exited with code ${code}`));
      }
      finish(resolve);
    });

    stream.pipe(proc.stdin);
  });
}


// ---------------------------------------------------------------------------
// Runtime detection & Dockerfile generation
//
// detectRuntime(files) returns:
//   runtime    - 'node' | 'python' | 'go' | 'ruby' | 'php' | 'rust' | 'java'
//                | 'dotnet' | 'elixir' | 'swift' | 'dart' | 'static'
//                | 'docker' | 'compose'
//   dockerfile - generated template text, or the user's own Dockerfile text
//                when runtime === 'docker'
//   exposePort - container port advertised to traefik
//   contextDir - repo-relative docker build context ('.' = repo root)
//   unsupported - true when the project shape cannot be run on this platform
//                 (currently Docker Compose); the caller must fail with the
//                 supplied reason instead of silently serving files statically.
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
const APP_MANIFESTS = [
  'package.json', 'requirements.txt', 'go.mod', 'gemfile', 'composer.json',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'cargo.toml', 'mix.exs',
  'package.swift', 'pubspec.yaml', 'tsconfig.json',
];
// Signals that a nested package.json directory is the real app root.
const NESTED_PKG_SIGNALS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'dockerfile', 'tsconfig.json'];
// Docker Compose cannot be represented by the single-container deploy path.
const COMPOSE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

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

// Classified deploy failure. `stage` says WHERE it broke (validation |
// prepare | build | start | platform), `fault` says WHOSE fault:
//   'user'    — the deployed codebase/Dockerfile/app is at fault
//               (Render-style: "your build failed", "your app crashed")
//   'platform'— BuildrsHQ infrastructure (SSH, VPS, our swap logic)
class DeployError extends Error {
  constructor(message, { stage = 'platform', fault = 'platform', runtimeLogs = null } = {}) {
    super(message);
    this.name = 'DeployError';
    this.stage = stage;
    this.fault = fault;
    if (runtimeLogs) this.runtimeLogs = runtimeLogs;
  }
}

// Keep stored logs bounded: build output can run to megabytes (npm ci noise,
// buildkit traces). Retain the HEAD (setup context) and the TAIL (where the
// failure is) — tail matters most, so it gets the larger share.
function capLogTail(text, maxBytes = 512 * 1024) {
  const s = String(text || '');
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  const tail = s.slice(-Math.floor(maxBytes * 0.85));
  const head = s.slice(0, Math.floor(maxBytes * 0.1));
  const dropped = s.length - head.length - tail.length;
  return `${head}\n\n... [${dropped} chars of build output omitted] ...\n\n${tail}`;
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
    const dfText = repairGoToolchain(text(e), dir);
    const m = /^\s*EXPOSE\s+(\d+)/im.exec(dfText);
    return {
      runtime: 'docker',
      dockerfile: dfText,
      exposePort: (m && clampPort(m[1])) || 80,
      contextDir: dir || '.',
    };
  };

  // Official golang images run with GOTOOLCHAIN=local, so a Dockerfile that
  // pins an older toolchain than go.mod's `go` directive hard-fails with
  // "go.mod requires go >= X". go.mod is authoritative — bump outdated
  // `FROM golang:` tags (variant suffix like -alpine preserved) and leave a
  // comment explaining the repair. Images already satisfying go.mod are
  // untouched, as are digest-pinned FROMs.
  const repairGoToolchain = (dfText, dir) => {
    const goMod = findIn(dir.toLowerCase(), 'go.mod');
    if (!goMod) return dfText;
    const gm = /^go\s+(\d+)\.(\d+)(?:\.(\d+))?/m.exec(text(goMod));
    if (!gm) return dfText;
    const req = [Number(gm[1]), Number(gm[2]), Number(gm[3] || 0)];
    const reqTag = gm[3] ? `${gm[1]}.${gm[2]}.${gm[3]}` : `${gm[1]}.${gm[2]}`;
    let patched = null;
    const out = dfText.replace(/^FROM[ \t]+golang:(\d+)\.(\d+)(?:\.(\d+))?(\S*)/gm, (line, ma, mi, pa, suffix) => {
      if (suffix.includes('@')) return line;
      const cur = [Number(ma), Number(mi), Number(pa || 0)];
      const cmp = (req[0] - cur[0]) || (req[1] - cur[1]) || (req[2] - cur[2]);
      if (cmp <= 0) return line;
      patched = `golang:${ma}.${mi}${pa ? '.' + pa : ''}${suffix}`;
      return `FROM golang:${reqTag}${suffix}`;
    });
    if (!patched) return dfText;
    return `# buildrs: bumped ${patched} to golang:${reqTag} to satisfy go.mod\n${out}`;
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
    // go.mod `go` directive → full version tag (patch included: `go 1.26.3`
    // must map to golang:1.26.3-alpine, not a possibly-older 1.26 minor).
    let goVer = '1.22';
    if (goMod) {
      const vm = /^go\s+(\d+)\.(\d+)(?:\.(\d+))?/m.exec(text(goMod));
      if (vm) {
        const minor = Number(vm[2]);
        if (Number(vm[1]) === 1 && minor >= 21) goVer = vm[1] + '.' + vm[2] + (vm[3] ? '.' + vm[3] : '');
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
      dockerfile: `FROM golang:${goVer}-alpine AS build
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

  // TypeScript projects: tsconfig.json + .ts source files. Compiles with tsc
  // (or the project's own build script) and runs the emitted JavaScript entry
  // point. Falls back to static only when no runnable entry point exists.
  const typescriptResult = dir => {
    const dk = dir.toLowerCase();
    const tsConfig = findIn(dk, 'tsconfig.json');
    const pkgEntry = findIn(dk, 'package.json');
    const pkg = (pkgEntry && parseJsonSafe(text(pkgEntry))) || {};
    const scripts = (pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)) ? pkg.scripts : {};
    const hasBuild = typeof scripts.build === 'string' && scripts.build.trim().length > 0;

    // Read tsconfig outDir (default 'dist').
    let outDir = 'dist';
    if (tsConfig) {
      const tsCfg = parseJsonSafe(text(tsConfig));
      if (tsCfg && tsCfg.compilerOptions && typeof tsCfg.compilerOptions.outDir === 'string') {
        outDir = tsCfg.compilerOptions.outDir.replace(/\/$/, '');
      }
    }

    // Lock files for reproducible installs.
    const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']
      .filter(n => findIn(dk, n));
    const copyLine = `COPY package.json${locks.length ? ' ' + locks.join(' ') : ''} ./`;
    const install = `RUN npm install --no-audit --no-fund`;

    // TypeScript entry points (.ts), checked before compiled output paths.
    const tsEntryNames = ['server.ts', 'app.ts', 'index.ts', 'main.ts'];
    const rootEntryName = tsEntryNames.find(n => findIn(dk, n));
    let cmd = null;
    let entryTsFile = null;
    let entryJsOut = null;

    const resolveTsCmd = (entryRel) => {
      const tsRel = entryRel.replace(/^\.\//, '');
      const jsRel = tsRel.replace(/\.ts$/, '.js');
      // If tsconfig sets an outDir, the compiled file lands under it.
      const outPath = outDir && outDir !== '.' ? `${outDir}/${jsRel.replace(/^\.\//, '')}` : jsRel;
      entryTsFile = tsRel;
      entryJsOut = outPath;
      cmd = `CMD ["node", ${JSON.stringify(outPath)}]`;
    };

    if (rootEntryName) {
      resolveTsCmd(rootEntryName);
    } else if (typeof pkg.main === 'string' && pkg.main.trim()) {
      const main = pkg.main.trim().replace(/^\.\//, '');
      const candidates = [
        main,
        main.endsWith('.ts') ? main : main + '.ts',
        main.endsWith('.js') ? main : main + '.ts',
      ].map(c => (dir ? dir + '/' + c : c).toLowerCase());
      const found = entries.find(e => candidates.includes(e.key));
      if (found) {
        resolveTsCmd(ctxRelOf(found, dir));
      }
    }

    // package.json without a runnable TypeScript entry: cannot execute.
    if (!cmd) return staticResult();

    // Port detection: from start script, then from .ts source files.
    let port = 3000;
    const start = typeof scripts.start === 'string' ? scripts.start.trim() : '';
    const startNode = start.match(/^node\s+([^\s;&|]+)/);
    const startTs = start.match(/^(?:ts-node|tsx|npx\s+tsx|npx\s+ts-node)\s+([^\s;&|]+)/);

    const scanFileForPort = (entryRel) => {
      const key = (dir ? dir + '/' + entryRel : entryRel).toLowerCase();
      const ef = entries.find(e => e.key === key);
      if (ef) {
        const t = text(ef);
        const pm = t.match(/\.PORT\s*\|\|\s*(\d{4,5})/) || t.match(/\.listen\(\s*(\d{4,5})/) || t.match(/\bport\s*=\s*(\d{4,5})/i);
        if (pm) return clampPort(pm[1]) || 3000;
      }
      return null;
    };

    let foundPort = null;
    if (startNode) {
      foundPort = scanFileForPort(startNode[1].replace(/^\.\//, ''));
    } else if (startTs) {
      foundPort = scanFileForPort(startTs[1].replace(/^\.\//, ''));
    } else if (entryTsFile) {
      foundPort = scanFileForPort(entryTsFile);
    }
    if (!foundPort) {
      // Scan all .ts source files in context for port hints.
      for (const e of entries) {
        if (e.name.endsWith('.ts') && (!dir || e.key.startsWith(dk + '/'))) {
          const t = text(e);
          const pm = t.match(/\.PORT\s*\|\|\s*(\d{4,5})/) || t.match(/\.listen\(\s*(\d{4,5})/) || t.match(/\bport\s*=\s*(\d{4,5})/i);
          if (pm) { foundPort = clampPort(pm[1]) || 3000; break; }
        }
      }
    }
    if (foundPort) port = foundPort;

    const buildStep = hasBuild
      ? `RUN npm run build`
      : `RUN npx tsc --project tsconfig.json`;

    return {
      runtime: 'typescript',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM node:20-alpine
WORKDIR /app
${copyLine}
${install}
COPY . .
${buildStep}
EXPOSE ${port}
ENV PORT=${port}
${cmd}
`,
    };
  };

  const rustResult = dir => {
    const dk = dir.toLowerCase();
    const cargo = findIn(dk, 'cargo.toml');
    if (!cargo) return staticResult();
    const manifest = text(cargo);
    const packageName = (manifest.match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1];
    const binSection = manifest.match(/\[\[bin\]\][\s\S]*?(?=\n\[|$)/);
    const binName = binSection ? (binSection[0].match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1] : null;
    const binary = String(binName || packageName || 'app').replace(/[^A-Za-z0-9_-]/g, '') || 'app';
    let port = 8080;
    const under = e => !dir || e.key.startsWith(dk + '/');
    for (const entry of entries.filter(e => e.name.endsWith('.rs') && under(e))) {
      const pm = text(entry).match(/(?:bind|listen|addr)[^\n]{0,120}?(\d{4,5})/i);
      if (pm) {
        const parsed = clampPort(pm[1]);
        if (parsed) { port = parsed; break; }
      }
    }
    return {
      runtime: 'rust',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/${binary} /usr/local/bin/app
ENV PORT=${port}
EXPOSE ${port}
CMD ["app"]
`,
    };
  };

  const javaResult = dir => {
    const dk = dir.toLowerCase();
    const pom = findIn(dk, 'pom.xml');
    const gradle = findIn(dk, 'build.gradle') || findIn(dk, 'build.gradle.kts');
    if (!pom && !gradle) return staticResult();
    const manifest = pom ? text(pom) : text(gradle);
    const jm = manifest.match(/<java\.version>\s*(\d+)/i)
      || manifest.match(/<maven\.compiler\.(?:source|release)>\s*(\d+)/i)
      || manifest.match(/sourceCompatibility\s*=\s*['"]?(\d+)/i)
      || manifest.match(/JavaLanguageVersion\.of\(\s*(\d+)/i);
    let major = jm ? parseInt(jm[1], 10) : 21;
    if (!Number.isFinite(major)) major = 21;
    if (![8, 11, 17, 21].includes(major)) {
      major = major >= 21 ? 21 : major >= 17 ? 17 : major >= 11 ? 11 : 8;
    }
    let port = 8080;
    const props = entries.find(e =>
      (!dir || e.key.startsWith(dk + '/')) && /^application\.(properties|ya?ml)$/i.test(e.name)
    );
    if (props) {
      const pm = text(props).match(/(?:server\.port|port)\s*[:=]\s*(\d{2,5})/i);
      if (pm) port = clampPort(pm[1]) || port;
    }
    const buildStage = pom
      ? `FROM maven:3.9-eclipse-temurin-${major} AS build
WORKDIR /src
COPY . .
RUN mvn -q -DskipTests package`
      : `FROM gradle:8-jdk${major} AS build
WORKDIR /src
COPY . .
RUN if [ -x ./gradlew ]; then ./gradlew build -x test --no-daemon; else gradle build -x test --no-daemon; fi`;
    const artifactCopy = pom
      ? 'COPY --from=build /src/target /app/artifacts'
      : 'COPY --from=build /src/build/libs /app/artifacts';
    return {
      runtime: 'java',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `${buildStage}
FROM eclipse-temurin:${major}-jre
WORKDIR /app
${artifactCopy}
ENV PORT=${port}
ENV SERVER_PORT=${port}
EXPOSE ${port}
CMD ["sh", "-c", "JAR=$(find /app/artifacts -maxdepth 1 -name '*.jar' ! -name '*-sources.jar' ! -name '*-javadoc.jar' | head -n1); exec java -jar \\"$JAR\\""]
`,
    };
  };

  const dotnetResult = dir => {
    const dk = dir.toLowerCase();
    const under = e => !dir || e.key.startsWith(dk + '/');
    let project = entries.find(e => e.dirKey === dk && /\.(csproj|fsproj|vbproj)$/i.test(e.name));
    if (!project) {
      const sln = entries.find(e => e.dirKey === dk && e.name.endsWith('.sln'));
      if (!sln) return staticResult();
      project = entries.find(e => under(e) && /\.(csproj|fsproj|vbproj)$/i.test(e.name)) || sln;
    }
    const manifest = text(project);
    const tfm = manifest.match(/<TargetFramework>\s*net(\d+)\.(\d+)/i);
    let major = tfm ? parseInt(tfm[1], 10) : 8;
    if (!Number.isFinite(major)) major = 8;
    if (![6, 7, 8, 9].includes(major)) major = major >= 9 ? 9 : major >= 8 ? 8 : major >= 7 ? 7 : 6;
    const assembly = project.rel.split('/').pop().replace(/\.(csproj|fsproj|vbproj|sln)$/i, '') || 'app';
    return {
      runtime: 'dotnet',
      exposePort: 8080,
      contextDir: dir || '.',
      dockerfile: `FROM mcr.microsoft.com/dotnet/sdk:${major}.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:${major}.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "${assembly}.dll"]
`,
    };
  };

  const elixirResult = dir => {
    const dk = dir.toLowerCase();
    const mix = findIn(dk, 'mix.exs');
    if (!mix) return staticResult();
    const manifest = text(mix);
    const phoenix = /phoenix/i.test(manifest);
    let port = 4000;
    const config = entries.find(e => (!dir || e.key.startsWith(dk + '/')) && /(?:runtime|prod|config)\.exs$/i.test(e.name));
    if (config) {
      const pm = text(config).match(/port\s*:\s*(\d{2,5})/i);
      if (pm) port = clampPort(pm[1]) || port;
    }
    return {
      runtime: 'elixir',
      exposePort: port,
      contextDir: dir || '.',
      dockerfile: `FROM elixir:1.16
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV MIX_ENV=prod
ENV PORT=${port}
RUN mix local.hex --force && mix local.rebar --force
COPY . .
RUN mix deps.get --only prod && mix compile
EXPOSE ${port}
CMD ["mix", ${phoenix ? '"phx.server"' : '"run", "--no-halt"'}]
`,
    };
  };

  const swiftResult = dir => {
    const dk = dir.toLowerCase();
    const pkg = findIn(dk, 'package.swift');
    if (!pkg) return staticResult();
    const name = (text(pkg).match(/\bname\s*:\s*"([^"]+)"/) || [])[1] || 'app';
    const binary = String(name).replace(/[^A-Za-z0-9_-]/g, '') || 'app';
    return {
      runtime: 'swift',
      exposePort: 8080,
      contextDir: dir || '.',
      dockerfile: `FROM swift:5.10 AS build
WORKDIR /src
COPY . .
RUN swift build -c release
FROM swift:5.10-slim
WORKDIR /app
COPY --from=build /src/.build/release/${binary} /usr/local/bin/app
ENV PORT=8080
EXPOSE 8080
CMD ["app"]
`,
    };
  };

  const dartResult = dir => {
    const dk = dir.toLowerCase();
    const pubspec = findIn(dk, 'pubspec.yaml');
    if (!pubspec) return staticResult();
    const name = (text(pubspec).match(/^name:\s*([A-Za-z0-9_]+)/m) || [])[1] || 'app';
    const entry = entries.find(e =>
      (!dir || e.key.startsWith(dk + '/')) &&
      ctxRelOf(e, dir).startsWith('bin/') &&
      e.name.endsWith('.dart')
    );
    const entryRel = entry ? ctxRelOf(entry, dir) : `bin/${name}.dart`;
    return {
      runtime: 'dart',
      exposePort: 8080,
      contextDir: dir || '.',
      dockerfile: `FROM dart:stable AS build
WORKDIR /src
COPY . .
RUN dart pub get
RUN dart compile exe ${entryRel} -o /out/app
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/app /usr/local/bin/app
ENV PORT=8080
EXPOSE 8080
CMD ["app"]
`,
    };
  };

  // Root-first marker chain. Root markers (design order) always beat nested
  // ones so a monorepo subdir never hijacks the root project.
  const rootDockerfile = inRoot('dockerfile');
  if (rootDockerfile) return dockerResult(rootDockerfile, '');
  // TypeScript projects carry tsconfig.json; detect before package.json so a
  // project with both tsconfig.json + package.json is treated as TypeScript
  // (its source is .ts, not .js).
  if (inRoot('tsconfig.json')) return typescriptResult('');
  if (inRoot('package.json')) return nodeResult('');
  if (inRoot('requirements.txt')) return pythonResult('');
  if (inRoot('go.mod')) return goResult('');
  if (inRoot('gemfile')) return rubyResult('');
  if (inRoot('cargo.toml')) return rustResult('');
  if (inRoot('pom.xml') || inRoot('build.gradle') || inRoot('build.gradle.kts')) return javaResult('');
  if (entries.some(e => e.dirKey === '' && /\.(csproj|fsproj|vbproj|sln)$/i.test(e.name))) return dotnetResult('');
  if (inRoot('mix.exs')) return elixirResult('');
  if (inRoot('package.swift')) return swiftResult('');
  if (inRoot('pubspec.yaml')) return dartResult('');

  // Docker Compose describes a multi-container app. The deploy path runs one
  // image, so fail clearly instead of silently serving the source as a static
  // site. A compose file with only `image:` services is treated as local
  // development tooling and falls through to the normal static detection.
  const compose = entries.find(e => COMPOSE_NAMES.includes(e.name));
  if (compose && /^\s*build\s*:/m.test(text(compose))) {
    return {
      runtime: 'compose',
      exposePort: 80,
      contextDir: compose.dir || '.',
      unsupported: true,
      reason: 'This project uses Docker Compose, which this deployment platform does not run. ' +
        'Add a Dockerfile for the service you want to deploy, or deploy a single service that does not need sidecar containers.',
    };
  }

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
  const nestedTsConfigs = entries.filter(e => e.dirKey !== '' && e.name === 'tsconfig.json');
  if (nestedTsConfigs.length) {
    const best = pickDir(nestedTsConfigs, e => APP_MANIFESTS.some(n => findIn(e.dirKey, n)));
    return typescriptResult(best.dir);
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
  const nestedCargo = entries.filter(e => e.dirKey !== '' && e.name === 'cargo.toml');
  if (nestedCargo.length) return rustResult(pickDir(nestedCargo).dir);
  const nestedJava = entries.filter(e =>
    e.dirKey !== '' && (e.name === 'pom.xml' || e.name === 'build.gradle' || e.name === 'build.gradle.kts')
  );
  if (nestedJava.length) return javaResult(pickDir(nestedJava).dir);
  const nestedDotnet = entries.filter(e => e.dirKey !== '' && /\.(csproj|fsproj|vbproj|sln)$/i.test(e.name));
  if (nestedDotnet.length) return dotnetResult(pickDir(nestedDotnet).dir);
  const nestedMix = entries.filter(e => e.dirKey !== '' && e.name === 'mix.exs');
  if (nestedMix.length) return elixirResult(pickDir(nestedMix).dir);
  const nestedSwift = entries.filter(e => e.dirKey !== '' && e.name === 'package.swift');
  if (nestedSwift.length) return swiftResult(pickDir(nestedSwift).dir);
  const nestedDart = entries.filter(e => e.dirKey !== '' && e.name === 'pubspec.yaml');
  if (nestedDart.length) return dartResult(pickDir(nestedDart).dir);

  // Source code extensions that indicate a server-side application. A project
  // with these files but no recognized runtime manifest should fail clearly
  // rather than silently serving source files as static downloads (which is
  // what the old catch-all staticResult did).
  const SERVER_SOURCE_EXTENSIONS = ['.ts', '.py', '.go', '.rb', '.java', '.rs', '.cs', '.fs', '.vb', '.ex', '.exs', '.dart', '.swift'];
  const hasServerSource = entries.some(e => SERVER_SOURCE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()));

  const anyNginx = entries.filter(e => e.name === 'nginx.conf');
  if (anyNginx.length) return staticResult(shallowest(anyNginx).rel);
  const phpFiles = entries.filter(e => e.name.endsWith('.php'));
  if (phpFiles.length) return phpResult(shallowest(phpFiles).dir);
  // Pure static sites (only HTML/CSS/JS/assets) → serve via nginx.
  // Projects with unrecognized server-side source code → fail with a clear
  // message instead of serving source files as static downloads.
  if (entries.some(e => e.name.endsWith('.html')) && !hasServerSource) return staticResult();
  if (!hasServerSource) return staticResult();
  return {
    runtime: 'unsupported',
    exposePort: 80,
    contextDir: '.',
    unsupported: true,
    reason: 'This project contains server-side source code but no recognized ' +
      'build or runtime manifest (package.json, tsconfig.json, requirements.txt, ' +
      'go.mod, cargo.toml, pom.xml, build.gradle, mix.exs, pubspec.yaml, Dockerfile, etc.). ' +
      'Add a Dockerfile or a supported manifest so the platform can build and run it.',
  };
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

  // Any root .html file can serve as the site entry point; pick the first
  // alphabetically so the result is deterministic.
  const rootHtml = entries
    .filter(e => !rel(e).includes('/') && rel(e).toLowerCase().endsWith('.html'))
    .sort((a, b) => (rel(a) < rel(b) ? -1 : rel(a) > rel(b) ? 1 : 0));
  if (rootHtml.length >= 1) {
    return [...entries, {
      name: 'index.html',
      path: 'index.html',
      content: rootHtml[0].content || '',
      encoding: rootHtml[0].encoding,
    }];
  }

  // No root .html, but a nested .html exists: serve that as the entry point.
  const nestedHtml = entries
    .filter(e => rel(e).includes('/') && rel(e).toLowerCase().endsWith('.html'))
    .sort((a, b) => (rel(a) < rel(b) ? -1 : rel(a) > rel(b) ? 1 : 0));
  if (nestedHtml.length >= 1) {
    return [...entries, {
      name: 'index.html',
      path: 'index.html',
      content: nestedHtml[0].content || '',
      encoding: nestedHtml[0].encoding,
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
  try {
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
    // COPYFILE_DISABLE: don't add macOS AppleDouble (._*) junk that breaks re-extraction
    execSync(`tar -czf '${tarPath}' -C '${tmpDir}' .`, {
      env: { ...process.env, COPYFILE_DISABLE: '1' }
    });
  } catch (error) {
    try { fs.rmSync(tarPath, { force: true }); } catch (__) {}
    if (/Invalid file path/.test(error?.message || '')) throw error;
    throw new Error('Failed to create tarball');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return tarPath;
}

async function deployProject(subdomain, files, hooks = {}) {
  // Observability hooks (Render-style): onStep drives the step timeline in
  // the UI, onLog streams raw build output while docker build runs.
  const emitStep = (name, status, detail = null) => {
    try { if (hooks.onStep) hooks.onStep({ name, status, detail }); } catch (_) {}
  };
  const emitLog = chunk => {
    try { if (hooks.onLog) hooks.onLog(String(chunk)); } catch (_) {}
  };

  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!sanitizedSubdomain || sanitizedSubdomain.length < 2) {
    throw new DeployError('Subdomain must be at least 2 characters', { stage: 'validation', fault: 'user' });
  }

  emitStep('prepare', 'running');
  emitLog(`Preparing ${files.length} file(s) for deployment...\n`);

  let deployBase;
  try {
    deployBase = await findWritableBase();
  } catch (fsErr) {
    throw new DeployError(`Deployment storage is unavailable: ${fsErr.message}`, { stage: 'platform', fault: 'platform' });
  }
  const deploymentDir = `${deployBase}/${sanitizedSubdomain}`;
  const containerName = `deploy-${sanitizedSubdomain}`;
  const nextContainerName = `${containerName}-next-${Date.now()}`;
  const imageTag = `${containerName}:${Date.now()}`;

  const detected = detectRuntime(files);
  const { runtime, dockerfile, exposePort, contextDir } = detected;
  if (detected.unsupported) {
    throw new DeployError(detected.reason || 'This project uses a deployment mode that is not supported.', {
      stage: 'validation',
      fault: 'user',
    });
  }
  const contextRel = String(contextDir || '.').replace(/^\.?\/+/, '').replace(/\/+$/, '') || '.';
  const buildDir = contextRel === '.' ? deploymentDir : `${deploymentDir}/${contextRel}`;
  console.log(`[deploy] Runtime: ${runtime}, port: ${exposePort}, context: ${contextRel}, dir: ${deploymentDir}`);
  emitLog(`Detected ${runtime} application (build context: ${contextRel}, port ${exposePort})\n`);

  // Rebuild the directory from scratch: stale paths from a prior deploy (e.g.
  // directories created by the old double-path bug) break extraction and writes.
  try {
    await sshExec(`rm -rf '${deploymentDir}' && mkdir -p '${deploymentDir}'`);
  } catch (prepErr) {
    throw new DeployError(`Could not prepare the deployment directory on the VPS: ${prepErr.message}`, { stage: 'platform', fault: 'platform' });
  }

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
    try {
      assertSafeRelPath(file.path);
    } catch (valErr) {
      throw new DeployError(valErr.message, { stage: 'validation', fault: 'user' });
    }
  }

  try {
    const tarPath = createTarballSync(fileEntries);
    try {
      // Stream the archive to the VPS instead of base64-encoding the whole
      // tarball into memory (which failed for large repositories).
      await sshUploadFile(tarPath, `${deploymentDir}/deploy.tar.gz`);
      await sshExec(`cd '${deploymentDir}' && tar -xzf deploy.tar.gz && rm deploy.tar.gz`);
    } finally {
      try { fs.rmSync(tarPath, { force: true }); } catch (_) {}
    }
    const fileCount = await sshExec(`find ${deploymentDir} -type f | wc -l`).catch(() => '0');
    const fileList = await sshExec(`ls ${deploymentDir}`).catch(() => '');
    console.log(`[deploy] ${fileCount.trim()} files in ${deploymentDir}: ${fileList}`);
    emitLog(`Uploaded ${fileCount.trim()} file(s) to the build server\n`);
  } catch (tarErr) {
    console.error(`[deploy] Tarball failed: ${tarErr.message}`);
    try {
      for (const file of fileEntries) {
        const relPath = file.path.replace(/^\//, '');
        await writeRemoteFile(`${deploymentDir}/${relPath}`, file.content || '', file.encoding === 'base64');
      }
    } catch (upErr) {
      throw new DeployError(`Failed to upload project files to the VPS: ${upErr.message}`, { stage: 'prepare', fault: 'platform' });
    }
  }

  // Write the Dockerfile and .dockerignore AFTER extraction: a repo file can
  // never clobber the one we build with, and the file is present even if the
  // per-file fallback above stopped early. For nested contexts both live
  // inside the context dir — the build runs `docker build -f <ctx>/Dockerfile <ctx>`
  // so COPY statements resolve inside the app dir (aegis-ai monorepo fix).
  try {
    if (dockerfile) {
      await writeRemoteFile(`${buildDir}/Dockerfile`, dockerfile);
    }
    const dockerignoreRel = (contextRel === '.' ? '.dockerignore' : `${contextRel}/.dockerignore`).toLowerCase();
    const hasDockerignore = files.some(f => buildFileRelPath(f).toLowerCase() === dockerignoreRel);
    if (!hasDockerignore) {
      await writeRemoteFile(`${buildDir}/.dockerignore`, dockerIgnoreFor());
    }
  } catch (dfErr) {
    throw new DeployError(`Failed to write the build files on the VPS: ${dfErr.message}`, { stage: 'platform', fault: 'platform' });
  }

  emitStep('prepare', 'done', `${fileEntries.length} files`);
  emitStep('build', 'running', `docker build (${runtime}, context ${contextRel})`);

  const buildCmd = `docker build --force-rm --no-cache -t ${imageTag} -f ${shq(`${buildDir}/Dockerfile`)} ${shq(buildDir)}`;
  emitLog(`\n$ ${buildCmd}\n`);
  try {
    // Stream raw build output to the UI while it runs (hooks.onLog → buildLogs).
    await sshExec(buildCmd, null, emitLog);
  } catch (err) {
    const ctxList = await sshExec(`ls -la ${shq(buildDir)} 2>/dev/null || echo 'DIR_MISSING'`).catch(() => 'DIR_MISSING');
    const rootList = contextRel === '.'
      ? ''
      : ` Repo root: ${await sshExec(`ls -la ${shq(deploymentDir)} 2>/dev/null || echo 'DIR_MISSING'}`).catch(() => 'DIR_MISSING')}`;
    const detail = ` Context contents: ${ctxList}.${rootList}`;
    // A failed docker build is almost always the user's code/Dockerfile:
    // dependency errors, compile failures, bad Dockerfile instructions.
    // SSH timeouts during build mean the build itself hung or exceeded the
    // time limit — also on the user's side of the contract.
    const isTimeout = /timeout exceeded/i.test(err.message || '');
    const message = isTimeout
      ? `Your build exceeded the ${Math.round(DEPLOY_TIMEOUT_MS / 60000)} minute time limit and was stopped.${detail}`
      : `Your build failed (${runtime}, context '${contextRel}'). See the build log for the failing step.${detail}`;
    emitLog(`\n--- BUILD FAILED ---\n${err.message}\n`);
    throw new DeployError(message, { stage: 'build', fault: 'user' });
  }
  emitStep('build', 'done', 'image built');
  emitLog(`\nBuild succeeded — image ${imageTag}\n`);

  const imageFiles = await sshExec(`docker run --rm --entrypoint ls ${imageTag} /usr/share/nginx/html/ 2>/dev/null || echo 'NO_FILES'`).catch(() => 'NO_FILES');
  console.log(`[deploy] Image files: ${imageFiles}`);

  const existingContainer = (await sshExec(`docker ps -q --filter "name=${containerName}" 2>/dev/null || true`).catch(() => '')).trim();

  emitStep('deploy', 'running', `starting ${nextContainerName}`);
  emitLog(`\nStarting container ${nextContainerName}...\n`);

  // Environment variables are injected at run time (never baked into the
  // image). Values are shell-quoted as a single KEY=value argument so spaces,
  // quotes and `$` survive. Secret values are never logged.
  const envVars = toEnvObject(hooks.env);
  const envEntries = Object.entries(envVars);
  if (envEntries.length) {
    emitLog(`Injecting ${envEntries.length} environment variable(s)\n`);
  }
  const envArgs = envEntries
    .map(([key, value]) => `  --env ${shq(`${key}=${value}`)} \\`)
    .join('\n');

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
${envArgs ? `${envArgs}\n` : ''}  --label 'traefik.enable=true' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.rule=Host(\`${sanitizedSubdomain}.${DOMAIN}\`) || Host(\`www.${sanitizedSubdomain}.${DOMAIN}\`)' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.entrypoints=websecure' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.tls.certresolver=letsencrypt' \\
  --label 'traefik.http.services.${sanitizedSubdomain}.loadbalancer.server.port=${exposePort}' \\
  ${imageTag}
`;

  let nextContainerId;
  try {
    await writeRemoteFile(`${deploymentDir}/run.sh`, runScript);
    nextContainerId = (await sshExec(`bash ${deploymentDir}/run.sh`)).trim();
  } catch (runErr) {
    throw new DeployError(`The container could not be started on the VPS: ${runErr.message}`, { stage: 'platform', fault: 'platform' });
  }
  // The container started — deploy step is done; only verify can still fail.
  emitStep('deploy', 'done', 'container started');

  // Verify the NEW container BEFORE swapping traffic (true blue-green): if
  // the user's app crashes on boot, the old container keeps serving and the
  // failure is attributed to the user's code with its runtime logs attached.
  emitStep('verify', 'running', 'waiting for the app to start');
  await new Promise(resolve => setTimeout(resolve, 3000));
  let running = 'false';
  let restarts = 0;
  try {
    // Full-JSON inspect: the --format template breaks on Docker 29, which
    // moved RestartCount from .State to top-level (template errors made the
    // old check report every healthy container as dead).
    const raw = await sshExec(`docker inspect ${nextContainerName} 2>/dev/null || echo '[]'`);
    const info = JSON.parse(raw)[0];
    if (info) {
      running = info.State && info.State.Running ? 'true' : 'false';
      restarts = Number(info.RestartCount ?? (info.State && info.State.RestartCount)) || 0;
    }
  } catch (_) {}

  if (running !== 'true' || restarts >= 2) {
    const runtimeLogs = await sshExec(`docker logs --tail 2000 ${nextContainerName} 2>&1`).catch(() => '');
    await sshExec(`docker rm -f ${nextContainerName} 2>/dev/null || true`).catch(() => '');
    emitLog(`\n--- APP FAILED TO START (restarted ${restarts}x) ---\n`);
    const reason = running !== 'true'
      ? 'Your app exited immediately after starting.'
      : `Your app is crash-looping (restarted ${restarts} times within seconds).`;
    throw new DeployError(
      `${reason} This is caused by your application code or configuration — see the runtime logs for the crash output. The previous deployment (if any) is still serving traffic.`,
      { stage: 'start', fault: 'user', runtimeLogs }
    );
  }

  // Swap: retire the old container, promote the verified one.
  try {
    if (existingContainer) {
      await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
    }
    await sshExec(`docker rename ${nextContainerName} ${containerName}`);
  } catch (swapErr) {
    console.warn('[deploy] blue-green swap failed, leaving standby container:', swapErr.message);
    await sshExec(`docker rm -f ${nextContainerName} 2>/dev/null || true`).catch(() => '');
    throw new DeployError(`Failed to swap traffic to the new container: ${swapErr.message}`, { stage: 'platform', fault: 'platform' });
  }

  emitStep('verify', 'done', 'app is up');
  console.log(`[deploy] ${containerName} started (${nextContainerId}) using blue-green swap`);

  try { await sshExec(`docker image prune -f 2>/dev/null || true`); } catch (_) {}

  const runtimeLogs = await sshExec(`docker logs --tail 2000 ${containerName} 2>&1`).catch(() => '');

  try {
    const containerFiles = await sshExec(`docker exec ${containerName} ls /usr/share/nginx/html/ 2>/dev/null || echo 'N/A'`).catch(() => 'N/A');
    console.log(`[deploy] Container nginx files: ${containerFiles}`);
    const curlCheck = await sshExec(`docker exec ${containerName} curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo 'CURL_FAILED'`).catch(() => 'CURL_FAILED');
    console.log(`[deploy] HTTP status check: ${curlCheck}`);
    const labelsCheck = await sshExec(`docker inspect ${containerName} --format '{{json .Config.Labels}}' 2>/dev/null || echo 'LABELS_FAILED'`).catch(() => 'LABELS_FAILED');
    console.log(`[deploy] Container labels: ${labelsCheck}`);
  } catch (checkErr) {
    console.warn('[deploy] File check issue:', checkErr.message);
  }

  return { containerId: nextContainerId, url: `https://${sanitizedSubdomain}.${DOMAIN}`, runtimeLogs };
}

async function writeRemoteFile(remotePath, content, isBase64 = false) {
  assertSafeRemotePath(remotePath);
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
  sshUploadFile,
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
  DeployError,
  capLogTail,
};
