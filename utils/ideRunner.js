/**
 * IDE Run engine — compiles/executes user code for the editor's Run button.
 *
 * Strategies (first available wins, override with IDE_EXEC_STRATEGY):
 *   vps    — `docker run` on the deploy VPS over ssh2 (production path)
 *   docker — local Docker CLI (dev machines with Docker)
 *   host   — local child_process (last-resort dev fallback)
 *
 * Every language is described by the manifest below: adding a language is a
 * manifest entry (image + shell script + host argv + error style). User files
 * are written into the sandbox as base64 (never interpolated into a shell as
 * raw text beyond sanitized paths), containers run with --network=none and
 * resource caps.
 */

const { spawn, spawnSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 15000;
const COMPILE_TIMEOUT_MS = 30000;
const PULL_GRACE_MS = 60000; // image pulls happen before the container starts
const OUTPUT_CAP = 256 * 1024;
const MAX_FILES = 50;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const MANIFEST = {
  javascript: {
    name: 'JavaScript (Node.js)',
    aliases: ['js', 'node', 'mjs'],
    image: 'node:22-alpine',
    defaultEntry: 'main.js',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `node ${c.entry}`,
    host: (c) => ['node', c.entry],
    errorStyle: 'node',
  },
  typescript: {
    name: 'TypeScript (Node type stripping)',
    aliases: ['ts', 'tsx'],
    image: 'node:22-alpine',
    defaultEntry: 'main.ts',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `node --experimental-strip-types --no-warnings ${c.entry}`,
    host: (c) => ['node', '--experimental-strip-types', '--no-warnings', c.entry],
    errorStyle: 'node',
  },
  python: {
    name: 'Python 3',
    aliases: ['py', 'python3'],
    image: 'python:3.12-slim',
    defaultEntry: 'main.py',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `python3 ${c.entry}`,
    host: (c) => ['python3', c.entry],
    errorStyle: 'python',
  },
  c: {
    name: 'C (gcc)',
    aliases: [],
    image: 'gcc:13',
    defaultEntry: 'main.c',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `gcc -O2 -o /tmp/a.out ${c.entry} && /tmp/a.out`,
    host: (c) => ['sh', '-c', `gcc -O2 -o "${c.tmp}/a.out" "${c.absEntry}" && "${c.tmp}/a.out" "$@"`, 'gcc-run'],
    errorStyle: 'gcc',
  },
  cpp: {
    name: 'C++ (g++)',
    aliases: ['c++', 'cxx'],
    image: 'gcc:13',
    defaultEntry: 'main.cpp',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `g++ -O2 -std=c++17 -o /tmp/a.out ${c.entry} && /tmp/a.out`,
    host: (c) => ['sh', '-c', `g++ -O2 -std=c++17 -o "${c.tmp}/a.out" "${c.absEntry}" && "${c.tmp}/a.out" "$@"`, 'cpp-run'],
    errorStyle: 'gcc',
  },
  java: {
    name: 'Java (JDK 21)',
    aliases: ['jdk'],
    image: 'eclipse-temurin:21-jdk',
    defaultEntry: 'Main.java',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `java ${c.entry}`,
    host: (c) => ['java', c.entry],
    errorStyle: 'javac',
  },
  go: {
    name: 'Go',
    aliases: ['golang'],
    image: 'golang:1.22-alpine',
    defaultEntry: 'main.go',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `go run ${c.entry}`,
    host: (c) => ['go', 'run', c.entry],
    errorStyle: 'go',
  },
  rust: {
    name: 'Rust (rustc)',
    aliases: ['rs'],
    image: 'rust:1.78-alpine',
    defaultEntry: 'main.rs',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `rustc -O -o /tmp/a.out ${c.entry} && /tmp/a.out`,
    host: (c) => ['sh', '-c', `rustc -O -o "${c.tmp}/a.out" "${c.absEntry}" && "${c.tmp}/a.out" "$@"`, 'rust-run'],
    errorStyle: 'rustc',
  },
  ruby: {
    name: 'Ruby',
    aliases: ['rb'],
    image: 'ruby:3.2-alpine',
    defaultEntry: 'main.rb',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `ruby ${c.entry}`,
    host: (c) => ['ruby', c.entry],
    errorStyle: 'ruby',
  },
  php: {
    name: 'PHP',
    aliases: [],
    image: 'php:8.2-cli-alpine',
    defaultEntry: 'main.php',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `php ${c.entry}`,
    host: (c) => ['php', c.entry],
    errorStyle: 'php',
  },
  bash: {
    name: 'Bash',
    aliases: ['sh-bash'],
    image: 'bash:5.2',
    defaultEntry: 'main.sh',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `bash ${c.entry}`,
    host: (c) => ['bash', c.entry],
    errorStyle: 'bash',
  },
  shell: {
    name: 'Shell (sh)',
    aliases: ['sh'],
    image: 'bash:5.2',
    defaultEntry: 'main.sh',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `sh ${c.entry}`,
    host: (c) => ['sh', c.entry],
    errorStyle: 'bash',
  },
  perl: {
    name: 'Perl',
    aliases: ['pl'],
    image: 'perl:5.40',
    defaultEntry: 'main.pl',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `perl ${c.entry}`,
    host: (c) => ['perl', c.entry],
    errorStyle: 'generic',
  },
  r: {
    name: 'R (Rscript)',
    aliases: ['rlang'],
    image: 'r-base',
    defaultEntry: 'main.R',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `Rscript ${c.entry}`,
    host: (c) => ['Rscript', c.entry],
    errorStyle: 'python',
  },
  csharp: {
    name: 'C# (.NET 8)',
    aliases: ['cs', 'dotnet'],
    image: 'mcr.microsoft.com/dotnet/sdk:8.0',
    defaultEntry: 'Program.cs',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) =>
      `printf '%s' '${Buffer.from(
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit><RestoreIgnoreFailedSources>true</RestoreIgnoreFailedSources></PropertyGroup></Project>'
      ).toString('base64')}' | base64 -d > /work/app.csproj && DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 dotnet run --project /work/app.csproj -v q --nologo`,
    host: (c) => ['sh', '-c', `printf '%s' '${Buffer.from('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit><RestoreIgnoreFailedSources>true</RestoreIgnoreFailedSources></PropertyGroup></Project>').toString('base64')}' | base64 -d > "${c.tmp}/app.csproj" && cd "${c.tmp}" && DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 dotnet run --project app.csproj -v q --nologo "$@"`, 'csharp-run'],
    errorStyle: 'generic',
  },
  dart: {
    name: 'Dart',
    aliases: [],
    image: 'dart:stable',
    defaultEntry: 'main.dart',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `dart run ${c.entry}`,
    host: (c) => ['dart', 'run', c.entry],
    errorStyle: 'generic',
  },
  swift: {
    name: 'Swift',
    aliases: [],
    image: 'swift:5.10',
    defaultEntry: 'main.swift',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `swift ${c.entry}`,
    host: (c) => ['swift', c.entry],
    errorStyle: 'gcc',
  },
  elixir: {
    name: 'Elixir',
    aliases: ['ex'],
    image: 'elixir:1.17',
    defaultEntry: 'main.exs',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `elixir ${c.entry}`,
    host: (c) => ['elixir', c.entry],
    errorStyle: 'generic',
  },
  powershell: {
    name: 'PowerShell',
    aliases: ['pwsh', 'ps1'],
    image: 'mcr.microsoft.com/powershell:7.4-ubuntu-22.04',
    defaultEntry: 'main.ps1',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `pwsh -NoProfile -File ${c.entry}`,
    host: (c) => ['pwsh', '-NoProfile', '-File', c.entry],
    errorStyle: 'generic',
  },
  sql: {
    name: 'SQL (SQLite)',
    aliases: ['sqlite', 'sqlite3'],
    image: 'python:3.12-slim',
    defaultEntry: 'query.sql',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `python3 -c ${shq(sqlRunnerPy(c.entry))}`,
    host: (c) => ['python3', '-c', sqlRunnerPy(c.entry)],
    errorStyle: 'python',
  },
  lua: {
    name: 'Lua 5.4',
    aliases: [],
    image: 'nickblah/lua:5.4-alpine',
    defaultEntry: 'main.lua',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    script: (c) => `lua ${c.entry}`,
    host: (c) => ['lua', c.entry],
    errorStyle: 'lua',
  },
  groovy: {
    name: 'Groovy',
    aliases: [],
    image: 'groovy:5-jdk21-alpine',
    defaultEntry: 'main.groovy',
    timeoutMs: COMPILE_TIMEOUT_MS,
    script: (c) => `groovy ${c.entry}`,
    host: (c) => ['groovy', c.entry],
    errorStyle: 'groovy',
  },
};

const ALIAS_INDEX = (() => {
  const idx = {};
  Object.entries(MANIFEST).forEach(([id, entry]) => {
    idx[id] = id;
    (entry.aliases || []).forEach((a) => { idx[a] = id; });
  });
  return idx;
})();

function resolveLanguage(input) {
  const key = String(input || '').trim().toLowerCase();
  const id = ALIAS_INDEX[key];
  return id ? { id, ...MANIFEST[id] } : null;
}

function listLanguages() {
  return Object.entries(MANIFEST).map(([id, e]) => ({
    id,
    name: e.name,
    aliases: e.aliases || [],
    defaultEntry: e.defaultEntry,
    mode: 'run',
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function sanitizeFiles(rawFiles) {
  if (!Array.isArray(rawFiles) || !rawFiles.length) {
    return { error: 'files must be a non-empty array' };
  }
  if (rawFiles.length > MAX_FILES) {
    return { error: `Too many files (max ${MAX_FILES})` };
  }
  const files = [];
  let total = 0;
  for (const f of rawFiles) {
    const raw = String(f?.path || f?.name || '');
    if (raw.startsWith('/')) {
      return { error: `Absolute file paths are not allowed: ${raw}` };
    }
    const rel = raw.replace(/^\\+/, '');
    if (!rel || !/^[\w.\-]+(\/[\w.\-]+)*$/.test(rel) || rel.split('/').includes('..')) {
      return { error: `Invalid file path: ${f?.path}` };
    }
    if (typeof f?.content !== 'string') {
      return { error: `File ${rel} has no string content` };
    }
    const bytes = Buffer.byteLength(f.content, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      return { error: `File ${rel} exceeds 1MB` };
    }
    total += bytes;
    if (total > MAX_TOTAL_BYTES) {
      return { error: 'Total payload exceeds 4MB' };
    }
    files.push({ path: rel, content: f.content });
  }
  return { files };
}

// ---------------------------------------------------------------------------
// Script construction
// ---------------------------------------------------------------------------

function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function sqlRunnerPy(entryRel) {
  return [
    'import sqlite3',
    'cur = sqlite3.connect(":memory:").cursor()',
    `sql = open(${JSON.stringify(entryRel)}).read()`,
    'for stmt in [s for s in sql.split(";") if s.strip()]:',
    '    cur.execute(stmt)',
    '    if cur.description:',
    "        print('|'.join(d[0] for d in cur.description))",
    '        for row in cur.fetchall():',
    "            print('|'.join(str(v) for v in row))",
  ].join('\n');
}

function buildContainerScript(entryDef, files, entryRel, args) {
  const writes = files
    .map((f) => {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      const b64 = Buffer.from(f.content, 'utf8').toString('base64');
      const mkdir = dir ? `mkdir -p ${shq(`/work/${dir}`)} && ` : '';
      return `${mkdir}printf '%s' '${b64}' | base64 -d > ${shq(`/work/${f.path}`)}`;
    })
    .join('\n');
  let cmd = entryDef.script({ entry: entryRel });
  const argSuffix = args && args.length ? ` ${args.map(shq).join(' ')}` : '';
  cmd = `${cmd}${argSuffix}`;
  return ['set -e', 'mkdir -p /work', writes, 'cd /work', cmd].join('\n');
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

function hasVpsConfig() {
  if (!process.env.DEPLOY_SSH_HOST) return false;
  if (process.env.DEPLOY_SSH_KEY) return true;
  try {
    if (process.env.DEPLOY_SSH_KEY_FILE && fs.existsSync(process.env.DEPLOY_SSH_KEY_FILE)) return true;
  } catch (_) { /* ignore */ }
  return false;
}

function getRawKey() {
  if (process.env.DEPLOY_SSH_KEY) return process.env.DEPLOY_SSH_KEY.replace(/\\n/g, '\n');
  const p = process.env.DEPLOY_SSH_KEY_FILE;
  if (p) {
    try { return fs.readFileSync(p, 'utf8'); } catch (_) { /* ignore */ }
  }
  return null;
}

let dockerAvailable = null;
function hasLocalDocker() {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    dockerAvailable = spawnSync('docker', ['--version'], { timeout: 5000, stdio: 'ignore' }).status === 0;
  } catch (_) {
    dockerAvailable = false;
  }
  return dockerAvailable;
}

function pickStrategy() {
  const forced = process.env.IDE_EXEC_STRATEGY;
  if (forced === 'vps' || forced === 'docker' || forced === 'host') return forced;
  if (hasVpsConfig()) return 'vps';
  if (hasLocalDocker()) return 'docker';
  return 'host';
}

function capOutput(text) {
  const s = String(text || '');
  if (s.length <= OUTPUT_CAP) return s;
  const half = Math.floor(OUTPUT_CAP / 2);
  return `${s.slice(0, half)}\n… [output truncated: ${s.length - OUTPUT_CAP} chars dropped] …\n${s.slice(s.length - half)}`;
}

const DOCKER_FLAGS = [
  '--rm', '-i', '--network=none', '--memory=256m', '--cpus=1',
  '--pids-limit=256', '--tmpfs', '/tmp:rw,size=64m',
  '-e', 'LANG=C.UTF-8', '-e', 'HOME=/tmp',
];

function dockerRunArgs(image, script) {
  return ['run', ...DOCKER_FLAGS, image, 'sh', '-c', script];
}

function vpsDockerCommand(image, script) {
  const argv = ['docker', ...dockerRunArgs(image, script)].map(shq).join(' ');
  return argv;
}

function runOnVps(cmd, { stdinData, timeoutMs, onOutput }) {
  return new Promise((resolve, reject) => {
    let Client;
    try {
      ({ Client } = require('ssh2'));
    } catch (err) {
      return reject(new Error('ssh2 module unavailable'));
    }
    const key = getRawKey();
    if (!key) return reject(new Error('DEPLOY_SSH_KEY env not set'));
    const conn = new Client();
    let settled = false;
    let output = '';
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch (_) { /* ignore */ }
      fn(arg);
    };
    const timer = setTimeout(() => {
      finish(resolve, { exitCode: -1, output: capOutput(output), timedOut: true });
    }, timeoutMs);
    conn
      .on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) return finish(reject, new Error(`VPS exec failed: ${err.message}`));
          stream.on('data', (d) => {
            output += d.toString();
            if (onOutput) onOutput(d.toString());
          });
          stream.stderr.on('data', (d) => {
            output += d.toString();
            if (onOutput) onOutput(d.toString());
          });
          if (stdinData) stream.write(stdinData);
          stream.end();
          stream.on('close', (code) => finish(resolve, { exitCode: code ?? 0, output: capOutput(output), timedOut: false }));
          stream.on('error', (e) => finish(reject, new Error(`VPS stream error: ${e.message}`)));
        });
      })
      .on('error', (err) => finish(reject, new Error(`VPS SSH failed: ${err.message}`)))
      .connect({
        host: process.env.DEPLOY_SSH_HOST,
        port: parseInt(process.env.DEPLOY_SSH_PORT || '22', 10),
        username: process.env.DEPLOY_SSH_USER || 'deployer',
        privateKey: key,
        readyTimeout: 20000,
        keepaliveInterval: 15000,
      });
  });
}

function runOnDockerCli(image, script, { stdinData, timeoutMs, onOutput }) {
  return new Promise((resolve) => {
    const proc = spawn('docker', dockerRunArgs(image, script), { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeoutMs);
    const onData = (d) => {
      output += d.toString();
      if (onOutput) onOutput(d.toString());
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    if (stdinData) proc.stdin.write(stdinData);
    proc.stdin.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ exitCode: -1, output: capOutput(`${output}\nDocker CLI failed to start`), timedOut });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, output: capOutput(output), timedOut });
    });
  });
}

function runOnHost(entryDef, files, entryRel, args, { stdinData, timeoutMs, onOutput }) {
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-run-'));
    // macOS os.tmpdir() is a symlink (/var -> /private/var); user code may
    // print either spelling, so strip both.
    let tmpVariants = [tmp];
    try { tmpVariants.push(fs.realpathSync(tmp)); } catch (_) { /* ignore */ }
    // Strip longest spelling first so `/var/...` inside `/private/var/...`
    // doesn't leave a dangling `/private` prefix.
    tmpVariants = tmpVariants.sort((a, b) => b.length - a.length);
    const strip = (s) => tmpVariants.reduce((acc, t) => acc.split(`${t}/`).join('').split(`${t}${path.sep}`).join(''), s);
    const cleanup = () => setTimeout(() => {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    }, 1000);
    try {
      for (const f of files) {
        const abs = path.join(tmp, f.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.content, 'utf8');
      }
      const base = entryDef.host({
        entry: entryRel,
        absEntry: path.join(tmp, entryRel),
        tmp,
      });
      // Shell-form hosts embed "$@" with a dummy $0 in base; direct argv
      // hosts simply receive the args appended after their entry.
      const spawnCmd = base[0];
      const spawnArgs = [...base.slice(1), ...(args || [])];
      const proc = spawn(spawnCmd, spawnArgs, { cwd: tmp, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
      }, timeoutMs);
      const onData = (d) => {
        output += d.toString();
        if (onOutput) onOutput(strip(d.toString()));
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      if (stdinData) proc.stdin.write(stdinData);
      proc.stdin.end();
      proc.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        resolve({ exitCode: -1, output: strip(capOutput(`${output}${err.message}\n(host toolchain not available?)`)), timedOut });
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        cleanup();
        resolve({ exitCode: code ?? -1, output: strip(capOutput(output)), timedOut });
      });
    } catch (err) {
      cleanup();
      resolve({ exitCode: -1, output: `host setup failed: ${err.message}`, timedOut: false });
    }
  });
}

// ---------------------------------------------------------------------------
// Error → problems parsing
// ---------------------------------------------------------------------------

function parseProblems(errorStyle, output) {
  const problems = [];
  const lines = String(output || '').split('\n');
  const push = (p) => {
    if (p.message && p.line) problems.push(p);
  };

  switch (errorStyle) {
    case 'gcc': {
      // path:line:col: error: msg  |  path:line:col: warning: msg
      lines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$/);
        if (m && m[5]) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: +m[3], severity: m[4] === 'note' ? 'info' : m[4], message: m[5] });
      });
      break;
    }
    case 'python': {
      // Traceback: last `File "x", line N` frame + the Exception line.
      let lastFile = null;
      let lastLine = null;
      lines.forEach((l) => {
        const fm = l.match(/^\s*File "([^"]+)", line (\d+)/);
        if (fm) { lastFile = fm[1]; lastLine = +fm[2]; return; }
        const em = l.match(/^([A-Za-z_.]*(?:Error|Exception|Interrupt)):?\s*(.*)$/);
        if (em && lastFile) {
          push({ file: String(lastFile).replace(/^\.\//, ''), line: lastLine, column: 1, severity: 'error', message: `${em[1]}${em[2] ? ': ' + em[2] : ''}` });
          lastFile = null;
        }
      });
      // R / editor style: path:line: message
      if (!problems.length) {
        lines.forEach((l) => {
          const m = l.match(/^(.+?):(\d+):\s*(.+)$/);
          if (m && /\.(R|r|py)$/.test(m[1])) push({ file: m[1].replace(/^\.\//, ''), line: +m[2], column: 1, severity: 'error', message: m[3] });
        });
      }
      break;
    }
    case 'go': {
      // path:line:col: message
      lines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+):(\d+):\s+(.*)$/);
        if (m && m[4] && !/^(http|https)/.test(m[1])) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: +m[3], severity: 'error', message: m[4] });
      });
      break;
    }
    case 'rustc': {
      // error[E0xxx]: msg  then  --> path:line:col
      for (let i = 0; i < lines.length; i++) {
        const em = lines[i].match(/^(error(?:\[E\d+\])?|warning)(?:\[[^\]]+\])?:\s*(.*)$/);
        if (!em) continue;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const loc = lines[j].match(/^\s*-->\s+(.+?):(\d+):(\d+)/);
          if (loc) {
            push({ file: loc[1].replace(/^\/work\//, ''), line: +loc[2], column: +loc[3], severity: em[1].startsWith('warning') ? 'warning' : 'error', message: em[2] });
            break;
          }
        }
      }
      break;
    }
    case 'javac': {
      // path:line: error: msg
      lines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+):\s+(error|warning):\s+(.*)$/);
        if (m) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: 1, severity: m[3], message: m[4] });
      });
      break;
    }
    case 'node': {
      // file:line  or file:line:col  (typescript strip / stack frames)
      lines.forEach((l) => {
        const m = l.match(/^\s*(?:file:\/\/)?([\w./-]+\.(?:ts|js|mjs|cjs)):(\d+)(?::(\d+))?\s*$/)
          || l.match(/^\s*(?:file:\/\/)?([\w./-]+\.(?:ts|js|mjs|cjs)):(\d+):(\d+)\s*-\s*(?:error|Error):\s*(.*)$/)
          || l.match(/^\s*([\w./-]+\.(?:ts|js|mjs|cjs)):(\d+):(\d+)\s+(.*)$/);
        if (m) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: +(m[3] || 1), severity: 'error', message: (m[4] || l.trim()).trim() });
      });
      if (!problems.length) {
        const em = lines.find((l) => /Error:/.test(l));
        if (em) push({ file: 'main', line: 1, column: 1, severity: 'error', message: em.trim() });
      }
      break;
    }
    case 'ruby': {
      // path:line:in `x': msg (TypeError)
      lines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+):\s*(?:in `[^']*':\s*)?(.*)$/);
        if (m && m[3] && /(Error|Exception|error)/.test(m[3])) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: 1, severity: 'error', message: m[3] });
      });
      break;
    }
    case 'php': {
      // PHP Parse error: msg in path on line N
      lines.forEach((l) => {
        const m = l.match(/PHP (?:Parse|Fatal) error:\s*(.*?)\s+in\s+(.+?)\s+on line\s+(\d+)/i);
        if (m) push({ file: m[2].replace(/^\/work\//, ''), line: +m[3], column: 1, severity: 'error', message: m[1] });
      });
      break;
    }
    case 'bash': {
      // path: line N: msg   |  line N: msg
      lines.forEach((l) => {
        const m = l.match(/^(.+?):\s*line (\d+):\s*(.*)$/) || l.match(/^line (\d+):\s*(.*)$/);
        if (m) {
          if (m.length === 4) push({ file: m[1].replace(/^\/work\//, ''), line: +m[2], column: 1, severity: 'error', message: m[3] });
          else push({ file: 'main', line: +m[1], column: 1, severity: 'error', message: m[2] });
        }
      });
      break;
    }
    case 'lua': {
      // lua: path:line: msg   |  path:line: msg
      lines.forEach((l) => {
        const m = l.match(/^(?:lua:\s*)?(.+?\.lua):(\d+):\s*(.*)$/);
        if (m && m[3]) push({ file: m[1].replace(/^\.\//, ''), line: +m[2], column: 1, severity: 'error', message: m[3] });
      });
      break;
    }
    case 'groovy': {
      // path.groovy: N: msg [@ line N, column C]
      lines.forEach((l) => {
        const m = l.match(/^(.+?\.groovy):\s*(\d+):\s*(.+)$/);
        if (m && m[3]) {
          const col = m[3].match(/@\s*line\s+\d+,\s*column\s+(\d+)/);
          push({
            file: m[1].replace(/^\.\//, ''),
            line: +m[2],
            column: col ? +col[1] : 1,
            severity: 'error',
            message: m[3].replace(/\s*@\s*line\s+\d+.*$/, '').trim(),
          });
        }
      });
      if (!problems.length) {
        const em = lines.find((l) => /Exception in thread|MultipleCompilationErrorsException/.test(l));
        if (em) push({ file: 'main', line: 1, column: 1, severity: 'error', message: em.trim() });
      }
      break;
    }
    default: {
      lines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+)(?::(\d+))?:\s+(?:error|Error)\s*:?\s*(.*)$/);
        if (m && m[4]) push({ file: m[1].replace(/^\.\//, ''), line: +m[2], column: +(m[3] || 1), severity: 'error', message: m[4] });
      });
    }
  }
  return problems.slice(0, 100);
}

// ---------------------------------------------------------------------------
// Rate gate
// ---------------------------------------------------------------------------

const rateState = new Map(); // userId -> { stamps: number[], active: number }

function rateGate(userId) {
  const now = Date.now();
  const key = String(userId || 'anon');
  const state = rateState.get(key) || { stamps: [], active: 0 };
  state.stamps = state.stamps.filter((t) => now - t < 60000);
  if (state.active >= 3) return { allowed: false, reason: 'Too many concurrent runs (max 3)' };
  if (state.stamps.length >= 20) return { allowed: false, reason: 'Run rate limit exceeded (20/min)' };
  state.stamps.push(now);
  state.active += 1;
  rateState.set(key, state);
  return {
    allowed: true,
    release: () => {
      const s = rateState.get(key);
      if (s) s.active = Math.max(0, s.active - 1);
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

async function executeRun({ language, files, entry, args, stdin, timeoutMs, onOutput }) {
  const def = resolveLanguage(language);
  if (!def) throw new Error(`Unsupported language: ${language}`);
  const v = sanitizeFiles(files);
  if (v.error) throw new Error(v.error);

  const entryRel = String(entry || def.defaultEntry).replace(/^\/+/, '');
  if (!v.files.some((f) => f.path === entryRel)) {
    throw new Error(`Entry file not found: ${entryRel}`);
  }
  const safeArgs = (Array.isArray(args) ? args : []).slice(0, 20).map((a) => String(a).slice(0, 200));
  const timeout = Math.min(Math.max(parseInt(timeoutMs, 10) || def.timeoutMs, 1000), 120000);
  const script = buildContainerScript(def, v.files, entryRel, safeArgs);
  const strategy = pickStrategy();

  let result;
  if (strategy === 'vps') {
    result = await runOnVps(vpsDockerCommand(def.image, script), {
      stdinData: typeof stdin === 'string' && stdin.length ? stdin.slice(0, 64 * 1024) : null,
      timeoutMs: timeout + PULL_GRACE_MS,
      onOutput,
    });
  } else if (strategy === 'docker') {
    result = await runOnDockerCli(def.image, script, {
      stdinData: typeof stdin === 'string' && stdin.length ? stdin.slice(0, 64 * 1024) : null,
      timeoutMs: timeout + PULL_GRACE_MS,
      onOutput,
    });
  } else {
    result = await runOnHost(def, v.files, entryRel, safeArgs, {
      stdinData: typeof stdin === 'string' && stdin.length ? stdin.slice(0, 64 * 1024) : null,
      timeoutMs: timeout,
      onOutput,
    });
  }

  const problems = result.exitCode !== 0 || result.timedOut
    ? parseProblems(def.errorStyle, result.output)
    : [];

  if (result.timedOut && !problems.length) {
    problems.push({ file: entryRel, line: 1, column: 1, severity: 'error', message: `Execution timed out after ${Math.round(timeout / 1000)}s` });
  }

  return {
    success: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    timedOut: !!result.timedOut,
    output: result.output,
    problems,
    language: def.id,
    backend: strategy,
  };
}

function generateRunId() {
  return crypto.randomBytes(8).toString('hex');
}

module.exports = {
  MANIFEST,
  resolveLanguage,
  listLanguages,
  sanitizeFiles,
  buildContainerScript,
  parseProblems,
  rateGate,
  executeRun,
  generateRunId,
  hasVpsConfig,
  hasLocalDocker,
  pickStrategy,
  OUTPUT_CAP,
};
