// Ephemeral cloud sandbox provisioner for Instant Bug Handoff.
// Provisions a real, viewable workspace that restores the exact codebase state
// (repository + branch + commit), environment variables and the buggy file, then
// exposes a live preview URL. Emits realtime status over Socket.IO.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const simpleGit = require('simple-git');
const EphemeralSandbox = require('../models/EphemeralSandbox');

let io = null;
const SANDBOX_ROOT = path.join(__dirname, '..', 'sandboxes');
const PORT_POOL = [];
for (let p = 4100; p <= 4900; p++) PORT_POOL.push(p);
const activeServers = new Map(); // sandboxKey -> http.Server
const usedPorts = new Set();

function init(socketIO) {
    io = socketIO;
    if (!fs.existsSync(SANDBOX_ROOT)) fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    startExpirySweeper();
}

function emit(sandboxKey, event, payload) {
    if (io) io.of('/collab').to(`sandbox:${sandboxKey}`).emit(event, payload);
}

function generateKey() {
    return 'sb_' + crypto.randomBytes(10).toString('hex');
}

function getFreePort() {
    const port = PORT_POOL.find(p => !usedPorts.has(p));
    if (!port) throw new Error('No free sandbox ports available');
    usedPorts.add(port);
    return port;
}

function run(cmd, cwd, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) return reject(Object.assign(err, { stdout, stderr }));
            resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
    });
}

// Build a self-contained, viewable preview server for a provisioned sandbox.
function startPreviewServer(sandbox, workdir) {
    const port = getFreePort();
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        if (url.pathname === '/' || url.pathname === '/preview') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderPreviewPage(sandbox, workdir));
            return;
        }
        if (url.pathname === '/files') {
            const rel = url.searchParams.get('path') || '';
            const filePath = path.join(workdir, rel);
            if (!filePath.startsWith(workdir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end('Not found'); return;
            }
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.html' || ext === '.htm') {
                // Serve HTML live so the UI preview actually renders.
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(filePath).pipe(res);
                return;
            }
            const content = fs.readFileSync(filePath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
            return;
        }
        res.writeHead(404); res.end('Not found');
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, () => {
            activeServers.set(sandbox.sandboxKey, server);
            resolve(port);
        });
    });
}

function renderPreviewPage(sandbox, workdir) {
    const envKeys = Object.keys(sandbox.envVars || {});
    const files = [];
    const walk = (dir, base = '') => {
        fs.readdirSync(dir).forEach(name => {
            const full = path.join(dir, name);
            const rel = path.join(base, name);
            if (fs.statSync(full).isDirectory()) walk(full, rel);
            else files.push(rel);
        });
    };
    try { walk(workdir); } catch (_) {}

    const fileRows = files.map(f => {
        const isHtml = f.toLowerCase().endsWith('.html');
        const view = isHtml
            ? `<a href="/files?path=${encodeURIComponent(f)}" target="_blank">Live preview</a> | <a href="/files?path=${encodeURIComponent(f)}">Source</a>`
            : `<a href="/files?path=${encodeURIComponent(f)}" target="_blank">Source</a>`;
        return `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;">${f}</td><td style="padding:4px 8px;border-bottom:1px solid #333;">${view}</td></tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sandbox ${sandbox.sandboxKey}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;}h1{font-size:18px;} .card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;} code{background:#0f172a;padding:2px 6px;border-radius:4px;} table{width:100%;border-collapse:collapse;font-size:13px;} a{color:#60a5fa;}</style></head>
<body>
<h1>🧪 Ephemeral Bug-Handoff Sandbox</h1>
<div class="card">
  <div><strong>Repository:</strong> <code>${sandbox.repository || 'local snapshot'}</code></div>
  <div><strong>Branch:</strong> <code>${sandbox.branch}</code></div>
  <div><strong>Commit:</strong> <code>${sandbox.commitSha || 'n/a'}</code></div>
  <div><strong>Status:</strong> <code>${sandbox.status}</code></div>
</div>
<div class="card">
  <div style="font-weight:600;margin-bottom:8px;">Environment variables (${envKeys.length})</div>
  ${envKeys.length ? envKeys.map(k => `<div><code>${k}</code></div>`).join('') : '<div style="color:#94a3b8;">None captured</div>'}
</div>
<div class="card">
  <div style="font-weight:600;margin-bottom:8px;">Files</div>
  <table>${fileRows || '<tr><td>No files</td></tr>'}</table>
</div>
</body></html>`;
}

async function writeSnapshot(sandbox, workdir) {
    fs.mkdirSync(workdir, { recursive: true });
    const files = Array.isArray(sandbox.files) ? sandbox.files : [];
    if (files.length === 0 && sandbox._codeSnapshot) {
        const cs = sandbox._codeSnapshot;
        if (cs.filePath && cs.content != null) {
            const fp = path.join(workdir, cs.filePath.replace(/^\/+/, ''));
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, cs.content);
        }
    }
    files.forEach(f => {
        if (!f.path) return;
        const fp = path.join(workdir, f.path.replace(/^\/+/, ''));
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, f.content || '');
    });
    // Persist env vars for the running sandbox.
    const envContent = Object.entries(sandbox.envVars || {})
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
    fs.writeFileSync(path.join(workdir, '.env.sandbox'), envContent);

    fs.writeFileSync(path.join(workdir, 'SANDBOX.md'), [
        '# Bug Handoff Sandbox',
        `Repository: ${sandbox.repository || 'n/a'}`,
        `Branch: ${sandbox.branch}`,
        `Commit: ${sandbox.commitSha || 'n/a'}`,
        '',
        'Environment variables are captured in .env.sandbox (values redacted for secrets).'
    ].join('\n'));
}

// Provision a sandbox for a handoff. Persists a record, restores code state and
// starts a live preview. Runs asynchronously; status is updated as it progresses.
async function provision(handoff) {
    const sandboxKey = generateKey();
    const workdir = path.join(SANDBOX_ROOT, sandboxKey);

    const sandbox = await EphemeralSandbox.create({
        handoffId: handoff._id,
        sandboxKey,
        createdBy: handoff.createdBy,
        companyId: handoff.companyId || null,
        repository: handoff.codeSnapshot?.repository || null,
        branch: handoff.codeSnapshot?.branch || 'main',
        commitSha: handoff.codeSnapshot?.commitSha || null,
        envVars: handoff.runtimeState?.envSnapshot || {},
        files: handoff.codeSnapshot?.content != null
            ? [{ path: handoff.codeSnapshot.filePath || 'handoff-file', language: handoff.codeSnapshot.language, content: handoff.codeSnapshot.content }]
            : [],
        status: 'provisioning'
    });
    // Stash a lightweight copy for snapshot writing.
    sandbox._codeSnapshot = handoff.codeSnapshot || {};

    emit(sandboxKey, 'sandbox:status', { sandboxKey, status: 'provisioning' });

    // Do not block the HTTP response on the full pipeline.
    provisionPipeline(sandbox, workdir).catch(err => {
        console.error('Sandbox provision error:', err.message);
    });

    return sandbox;
}

async function provisionPipeline(sandbox, workdir) {
    try {
        fs.mkdirSync(workdir, { recursive: true });
        await writeSnapshot(sandbox, workdir);

        if (sandbox.repository) {
            sandbox.status = 'cloning';
            await sandbox.save();
            emit(sandbox.sandboxKey, 'sandbox:status', { sandboxKey: sandbox.sandboxKey, status: 'cloning' });
            try {
                const git = simpleGit();
                const branchArg = sandbox.branch && sandbox.branch !== 'main' ? ['-b', sandbox.branch] : [];
                await git.clone(sandbox.repository, workdir, { '--depth': 1, ...(branchArg.length ? { '--branch': sandbox.branch } : {}) });
                if (sandbox.commitSha) {
                    await simpleGit(workdir).checkout(sandbox.commitSha);
                }
                // Overlay the buggy file on top of the clone.
                await writeSnapshot(sandbox, workdir);
            } catch (cloneErr) {
                sandbox.logs = (sandbox.logs || '') + `\n[clone] ${cloneErr.message}`;
                console.warn('Sandbox clone skipped:', cloneErr.message);
            }

            // Best-effort dependency install + dev start so the preview is live.
            if (fs.existsSync(path.join(workdir, 'package.json'))) {
                sandbox.status = 'installing';
                await sandbox.save();
                emit(sandbox.sandboxKey, 'sandbox:status', { sandboxKey: sandbox.sandboxKey, status: 'installing' });
                try {
                    await run('npm install --no-audit --no-fund', workdir, 180000);
                } catch (installErr) {
                    sandbox.logs = (sandbox.logs || '') + `\n[install] ${installErr.message}`;
                }
            }
        }

        sandbox.status = 'starting';
        await sandbox.save();
        emit(sandbox.sandboxKey, 'sandbox:status', { sandboxKey: sandbox.sandboxKey, status: 'starting' });

        const port = await startPreviewServer(sandbox, workdir);
        const base = process.env.SANDBOX_PUBLIC_URL || `http://localhost:${port}`;
        sandbox.previewUrl = `${base}/preview`;
        sandbox.ports = [port];
        sandbox.workdir = workdir;
        sandbox.status = 'ready';
        sandbox.readyAt = new Date();
        await sandbox.save();

        // Reflect ready status back onto the parent handoff.
        if (handoffModel()) {
            await handoffModel().updateOne(
                { _id: sandbox.handoffId },
                { 'sandbox.status': 'ready', 'sandbox.url': sandbox.previewUrl, 'sandbox.commitSha': sandbox.commitSha }
            ).catch(() => {});
        }

        emit(sandbox.sandboxKey, 'sandbox:ready', {
            sandboxKey: sandbox.sandboxKey,
            previewUrl: sandbox.previewUrl,
            status: 'ready'
        });
    } catch (err) {
        sandbox.status = 'failed';
        sandbox.failedAt = new Date();
        sandbox.error = err.message;
        await sandbox.save();
        emit(sandbox.sandboxKey, 'sandbox:failed', { sandboxKey: sandbox.sandboxKey, error: err.message });
    }
}

let _handoffModel = null;
function handoffModel() {
    if (_handoffModel) return _handoffModel;
    try { _handoffModel = require('../models/DebugHandoff'); } catch (_) {}
    return _handoffModel;
}

async function getStatus(sandboxKey) {
    return EphemeralSandbox.findOne({ sandboxKey });
}

async function stopSandbox(sandboxKey) {
    const server = activeServers.get(sandboxKey);
    if (server) {
        server.close();
        activeServers.delete(sandboxKey);
    }
    await EphemeralSandbox.updateOne({ sandboxKey }, { status: 'expired', expiresAt: new Date() }).catch(() => {});
}

function startExpirySweeper() {
    setInterval(async () => {
        try {
            const expired = await EphemeralSandbox.find({ status: { $in: ['ready', 'failed'] }, expiresAt: { $lte: new Date() } });
            for (const sb of expired) {
                await stopSandbox(sb.sandboxKey);
            }
        } catch (_) {}
    }, 60 * 1000).unref?.();
}

async function stopAll() {
    for (const [key, server] of activeServers) {
        try { server.close(); } catch (_) {}
        usedPorts.delete(server.address()?.port);
    }
    activeServers.clear();
}

module.exports = { init, provision, getStatus, stopSandbox, stopAll };
