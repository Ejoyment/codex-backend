/**
 * VPS terminal transport — ssh2 → `docker exec` with a real PTY inside a
 * long-running toolbox container on the deploy VPS.
 *
 * Exposes the node-pty subset TerminalService relies on (write / resize /
 * kill / onData) so the socket protocol in server.js stays untouched, plus
 * pushFiles/pullFiles for the VFS ↔ container workspace sync:
 *
 *   create  → syncVfsToPty (local dir) → pushFiles  (tar → container)
 *   destroy → pullFiles (container → local dir) → syncPtyDirToVFS → rm -f
 *
 * Transport selection: enabled when DEPLOY_SSH_* is configured, unless
 * IDE_TERMINAL_TRANSPORT=local forces the on-host PTY path.
 */

const { spawn } = require('child_process');
const fs = require('fs');

const TOOLBOX_IMAGE = process.env.IDE_TOOLBOX_IMAGE || 'buildrs/toolbox:latest';
const MAX_PRE_ONDATA_BYTES = 256 * 1024;

function hasVpsSshConfig() {
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

function terminalTransportEnabled() {
  return process.env.IDE_TERMINAL_TRANSPORT !== 'local' && hasVpsSshConfig();
}

function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

class VpsShell {
  constructor({ sessionId, workspaceId, userId, cols = 80, rows = 24, workspacePath }) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.userId = userId;
    this.cols = cols;
    this.rows = rows;
    this.workspacePath = workspacePath;
    this.container = `buildrs-term-${sessionId}`;
    this.client = null;
    this.stream = null;
    this.closed = false;
    this.dataCb = null;
    this.pending = []; // output received before onData() is registered
    this.pendingBytes = 0;
  }

  _emit(data) {
    if (this.dataCb) {
      this.dataCb(data);
    } else if (this.pendingBytes < MAX_PRE_ONDATA_BYTES) {
      this.pending.push(data);
      this.pendingBytes += Buffer.byteLength(data);
    }
  }

  onData(cb) {
    this.dataCb = cb;
    const queued = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    queued.forEach((chunk) => cb(chunk));
  }

  _connect() {
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
      const done = (fn, arg) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };
      conn
        .on('ready', () => {
          conn.on('error', (err) => {
            if (!this.closed) this._emit(`\r\n[terminal] ssh error: ${err.message}\r\n`);
            this.closed = true;
          });
          conn.on('close', () => {
            if (!this.closed) this._emit('\r\n[terminal] ssh connection closed\r\n');
            this.closed = true;
          });
          done(resolve, conn);
        })
        .on('error', (err) => done(reject, new Error(`VPS ssh failed: ${err.message}`)))
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

  // One-shot remote command (no pty): resolves { code, out }.
  _run(cmd, { stdin = null, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client || this.closed) return reject(new Error('ssh connection closed'));
      this.client.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { stream.close(); } catch (_) { /* ignore */ }
          reject(new Error(`remote command timed out: ${cmd.slice(0, 80)}`));
        }, timeoutMs);
        const finish = (fn, arg) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(arg);
        };
        stream.on('data', (d) => { out += d.toString(); });
        stream.stderr.on('data', (d) => { out += d.toString(); });
        stream.on('close', (code) => finish(resolve, { code: code ?? 0, out }));
        stream.on('error', (e) => finish(reject, e));
        if (stdin) stream.write(stdin);
        stream.end();
      });
    });
  }

  async _runOrThrow(cmd, opts = {}) {
    const { code, out } = await this._run(cmd, opts);
    if (code !== 0) throw new Error(`remote command failed (${code}): ${out.trim() || cmd}`);
    return out;
  }

  async start() {
    this.client = await this._connect();

    // Container lifecycle: stale leftovers cleaned, then a throwaway
    // long-running toolbox (network enabled — git/curl are the point).
    await this._run(`docker rm -f ${shq(this.container)} 2>/dev/null || true`);
    const runCmd = [
      'docker run -d --rm',
      `--name ${shq(this.container)}`,
      '--memory=512m', '--cpus=1', '--pids-limit=512',
      '-w /workspace',
      `-e WORKSPACE_ID=${shq(this.workspaceId)}`,
      `-e USER_ID=${shq(this.userId)}`,
      // Project-aware prompt: cwd basename + current git branch.
      `-e PS1=${shq('\\[\\e[36m\\]\\w\\[\\e[0m\\] \\[\\e[33m\\]$(git rev-parse --abbrev-ref HEAD 2>/dev/null | sed -e "s/^/(/" -e "s/$/)/")\\[\\e[0m\\] \\[\\e[32m\\]\\$ \\[\\e[0m\\]')}`,
      shq(TOOLBOX_IMAGE),
      'sleep infinity',
    ].join(' ');
    await this._runOrThrow(runCmd);

    // Interactive PTY channel into the container.
    const stream = await new Promise((resolve, reject) => {
      this.client.exec(
        `docker exec -it ${shq(this.container)} bash`,
        { pty: { term: 'xterm-256color', cols: this.cols, rows: this.rows } },
        (err, s) => (err ? reject(err) : resolve(s))
      );
    });
    this.stream = stream;
    stream.on('data', (d) => this._emit(d.toString()));
    stream.stderr?.on('data', (d) => this._emit(d.toString()));
    stream.on('close', () => {
      if (!this.closed) this._emit('\r\n[terminal] session ended\r\n');
      this.closed = true;
    });
    stream.on('error', () => { this.closed = true; });
  }

  write(data) {
    if (this.closed || !this.stream) throw new Error('Terminal session closed');
    this.stream.write(data);
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    try {
      this.stream?.setWindow(rows, cols, 0, 0);
    } catch (_) { /* window-change not supported */ }
  }

  _tarLocal(dir) {
    return new Promise((resolve, reject) => {
      const proc = spawn('tar', ['-C', dir, '-czf', '-', '.']);
      const chunks = [];
      proc.stdout.on('data', (d) => chunks.push(d));
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`local tar failed (${code})`))));
    });
  }

  _extractLocal(dir, buf) {
    return new Promise((resolve, reject) => {
      const proc = spawn('tar', ['-C', dir, '-xzf', '-']);
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`local untar failed (${code})`))));
      proc.stdin.on('error', () => { /* container may have closed */ });
      proc.stdin.end(buf);
    });
  }

  // VFS files (already materialized into workspacePath) → container /workspace.
  async pushFiles() {
    if (!fs.existsSync(this.workspacePath)) return;
    const tar = await this._tarLocal(this.workspacePath);
    await this._runOrThrow(`docker exec -i ${shq(this.container)} tar -C /workspace -xzf -`, {
      stdin: tar,
      timeoutMs: 30000,
    });
  }

  // Container /workspace → local workspacePath (caller then syncs back to VFS).
  async pullFiles() {
    if (this.closed || !this.client) return;
    const buf = await new Promise((resolve, reject) => {
      this.client.exec(`docker exec ${shq(this.container)} tar -C /workspace -czf - .`, (err, stream) => {
        if (err) return reject(err);
        const chunks = [];
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { stream.close(); } catch (_) { /* ignore */ }
          reject(new Error('pull-back tar timed out'));
        }, 30000);
        const finish = (fn, arg) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(arg);
        };
        stream.on('data', (d) => chunks.push(d));
        stream.stderr.on('data', () => { /* tar warnings */ });
        stream.on('close', (code) => (code === 0 ? finish(resolve, Buffer.concat(chunks)) : finish(reject, new Error(`remote tar failed (${code})`))));
        stream.on('error', (e) => finish(reject, e));
        stream.end();
      });
    });
    await this._extractLocal(this.workspacePath, buf);
  }

  // Best-effort teardown: shell exits, container removed, ssh closed.
  kill() {
    if (this.closed && !this.client) return;
    this.closed = true;
    try { this.stream?.end(); } catch (_) { /* ignore */ }
    if (this.client) {
      try {
        this.client.exec(`docker rm -f ${shq(this.container)} 2>/dev/null || true`, () => {
          try { this.client.end(); } catch (_) { /* ignore */ }
        });
      } catch (_) {
        try { this.client.end(); } catch (_) { /* ignore */ }
      }
    }
  }
}

module.exports = {
  VpsShell,
  terminalTransportEnabled,
  hasVpsSshConfig,
  TOOLBOX_IMAGE,
};
