/**
 * Deployment file resolution + validation.
 *
 * - validateDeployFiles: env-configurable count/size caps and path safety
 *   checks that run BEFORE a deployment is created.
 * - backfillFileContent: fills metadata-only file lists (project file API /
 *   GitHub tree return paths without content) from the DB or from GitHub.
 *   GitHub fetches are tarball-first (one request for the whole repo,
 *   binary-safe) with a parallel blob/contents fallback that never aborts
 *   the deploy because a single file 404s or times out.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const CodeFile = require('../models/CodeFile');
const Integration = require('../models/Integration');
const { assertSafeRelPath, buildFileRelPath } = require('./deploymentService');

// Caps are read at call time so tests and operators can tune them via env.
function capInt(name, fallback) {
    const v = parseInt(process.env[name], 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

function limits() {
    return {
        maxFiles: capInt('DEPLOY_MAX_FILES', 1000),
        maxFileBytes: capInt('DEPLOY_MAX_FILE_BYTES', 10 * 1024 * 1024),
        maxTotalBytes: capInt('DEPLOY_MAX_TOTAL_BYTES', 50 * 1024 * 1024),
        backfillTimeoutMs: capInt('DEPLOY_BACKFILL_TIMEOUT_MS', 120000),
    };
}

function fmtBytes(n) {
    if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))}MB`;
    if (n >= 1024) return `${Math.round(n / 1024)}KB`;
    return `${n}B`;
}

// Normalize a file's directory + name into a stable key so content can be
// matched across the different `path` shapes in this codebase:
//   '/' + name='a.js'         (CodeFile directory shape)
//   '/a.js' + name='a.js'     (editor save / GitHub tree full-path shape)
//   '/src' + name='a.js'      (nested directory)
//   '/src/a.js' + name='a.js' (nested full path)
function fileKey(f) {
    const p = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    let dir = p;
    if (p === f.name) dir = '';
    else if (p.endsWith('/' + f.name)) dir = p.slice(0, -(f.name.length + 1));
    return dir ? `${dir}/${f.name}` : f.name;
}

function fileBytes(f) {
    const content = typeof f.content === 'string' ? f.content : '';
    return f.encoding === 'base64'
        ? Buffer.byteLength(content, 'base64')
        : Buffer.byteLength(content, 'utf8');
}

// Content came from GitHub/tarball as raw bytes: keep binary files as
// base64 (flagged) so utf8 round-trips never corrupt them; store text as-is.
function looksBinary(buf) {
    if (buf.includes(0)) return true;
    return Buffer.compare(Buffer.from(buf.toString('utf8'), 'utf8'), buf) !== 0;
}

function applyContent(f, buf) {
    if (looksBinary(buf)) {
        f.content = buf.toString('base64');
        f.encoding = 'base64';
    } else {
        f.content = buf.toString('utf8');
        delete f.encoding;
    }
}

// Runs before the Deployment document is created so bad payloads get a 400
// instead of a failed deployment. Throws with a user-facing message.
function validateDeployFiles(files) {
    const { maxFiles, maxFileBytes, maxTotalBytes } = limits();
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('Project has no deployable files.');
    }
    if (files.length > maxFiles) {
        throw new Error(`Too many files: ${files.length} exceeds the ${maxFiles}-file deployment limit.`);
    }
    let total = 0;
    for (const f of files) {
        if (!f || !f.name || typeof f.name !== 'string') {
            throw new Error('Invalid file path');
        }
        const rel = buildFileRelPath(f);
        try {
            assertSafeRelPath(rel);
        } catch (err) {
            throw new Error(`${err.message} (in "${f.name}")`);
        }
        const size = fileBytes(f);
        if (size > maxFileBytes) {
            throw new Error(`File too large: ${f.name} exceeds ${fmtBytes(maxFileBytes)}.`);
        }
        total += size;
    }
    if (total > maxTotalBytes) {
        throw new Error(`Deployment too large: ${fmtBytes(total)} exceeds the ${fmtBytes(maxTotalBytes)} total limit.`);
    }
}

async function mapWithConcurrency(items, limit, fn) {
    let idx = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (idx < items.length) {
            const i = idx++;
            await fn(items[i], i);
        }
    });
    await Promise.all(workers);
}

// One tarball request for the whole repository — no per-file rate limits,
// works for files above the contents API's 1MB cap, and binary-safe.
async function fillFromTarball(repo, token, pendingFiles, endAt) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-repo-'));
    try {
        const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tarball`;
        const resp = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'buildrs-deploy',
            },
            params: repo.defaultBranch ? { ref: repo.defaultBranch } : undefined,
            responseType: 'stream',
            timeout: Math.max(5000, Math.min(60000, endAt - Date.now())),
            maxRedirects: 5,
            maxContentLength: 200 * 1024 * 1024,
            maxBodyLength: 200 * 1024 * 1024,
        });

        const tarFile = path.join(tmpRoot, 'repo.tar.gz');
        await new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(tarFile);
            resp.data.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', resolve);
            resp.data.pipe(ws);
        });

        const extractDir = path.join(tmpRoot, 'x');
        fs.mkdirSync(extractDir);
        execFileSync('tar', ['-xzf', tarFile, '-C', extractDir], {
            timeout: 60000,
            env: { ...process.env, COPYFILE_DISABLE: '1' },
        });

        // Index every extracted file, stripping GitHub's top-level
        // {owner}-{repo}-{sha}/ directory when present.
        const byRel = new Map();
        const walk = (dir, prefix) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, ent.name);
                const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
                if (ent.isDirectory()) walk(abs, rel);
                else byRel.set(rel, abs);
            }
        };
        const top = fs.readdirSync(extractDir, { withFileTypes: true });
        if (top.length === 1 && top[0].isDirectory()) {
            walk(path.join(extractDir, top[0].name), '');
        } else {
            walk(extractDir, '');
        }

        let filled = 0;
        for (const f of pendingFiles) {
            if (f._resolved || Date.now() > endAt) continue;
            const abs = byRel.get(fileKey(f));
            if (!abs) continue;
            let st;
            try { st = fs.statSync(abs); } catch (_) { continue; }
            if (!st.isFile()) continue;
            applyContent(f, fs.readFileSync(abs));
            f._resolved = true;
            filled++;
        }
        return filled;
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

// Parallel per-file fallback for whatever the tarball missed (files with a
// blob `sha` go through the blob API — no 1MB cap; others use contents).
// Individual failures are logged, never thrown: one missing file must not
// take down a 250-file deploy.
async function fillFromGitHubApi(repo, token, files, endAt) {
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'buildrs-deploy',
    };
    const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

    await mapWithConcurrency(files, 8, async (f) => {
        if (f._resolved || Date.now() > endAt) return;
        try {
            if (f.sha) {
                const { data } = await axios.get(`${base}/git/blobs/${encodeURIComponent(f.sha)}`, {
                    headers, timeout: 20000,
                });
                if (data && typeof data.content === 'string') {
                    applyContent(f, Buffer.from(data.content.replace(/\n/g, ''), 'base64'));
                    f._resolved = true;
                    return;
                }
            }
            const rel = fileKey(f).split('/').map(encodeURIComponent).join('/');
            const { data } = await axios.get(`${base}/contents/${rel}`, {
                headers,
                timeout: 20000,
                params: repo.defaultBranch ? { ref: repo.defaultBranch } : undefined,
            });
            if (data && data.encoding === 'base64' && typeof data.content === 'string') {
                applyContent(f, Buffer.from(data.content, 'base64'));
                f._resolved = true;
            } else if (data && typeof data.content === 'string') {
                f.content = data.content;
                f._resolved = true;
            }
        } catch (err) {
            const status = err.response && err.response.status;
            console.warn(`[deploy] could not fetch ${fileKey(f)} from GitHub: ${status || err.message}`);
        }
    });
}

/**
 * Fill `files` (mutated in place) with real content before building.
 * `deadline` is an absolute timestamp; backfill stops resolving after it.
 */
async function backfillFileContent({ userId, projectId, workspaceId, source, repo, files, deadline }) {
    const { backfillTimeoutMs } = limits();
    const endAt = deadline || (Date.now() + backfillTimeoutMs);
    const unresolved = () => files.filter(f => !f.content && !f._resolved);
    if (!unresolved().length) return;

    // 1) Project files: merge content from the CodeFile collection (the
    // project file list API is metadata-only). A record with content '' is a
    // genuinely empty file — resolved, not pending.
    if (projectId) {
        const or = [{ project: projectId }];
        if (workspaceId) or.push({ company: workspaceId });
        const dbFiles = await CodeFile.find({ $or: or }).lean();
        const byKey = new Map();
        for (const dbf of dbFiles) {
            byKey.set(fileKey(dbf), typeof dbf.content === 'string' ? dbf.content : '');
        }
        for (const f of unresolved()) {
            if (byKey.has(fileKey(f))) {
                f.content = byKey.get(fileKey(f));
                f._resolved = true;
            }
        }
        if (!unresolved().length) return;
    }

    const stillPending = unresolved();

    if (source !== 'github' || !repo || !repo.owner || !repo.name) {
        // DB-backed deploy: keep today's lenient behavior — files missing
        // from the DB deploy as empty, but an entirely content-less payload
        // is a metadata-only list and must fail loudly.
        if (stillPending.length === files.length) {
            throw new Error(
                'No file content to deploy: files were sent without content. Re-open the files in the editor and deploy again.'
            );
        }
        if (stillPending.length) {
            console.warn(`[deploy] ${stillPending.length} file(s) have no content in the project DB:`,
                stillPending.slice(0, 5).map(fileKey).join(', '));
        }
        return;
    }

    // 2) GitHub repo deploy.
    const integration = await Integration.findOne({ userId, provider: 'github', isActive: true }).lean();
    if (!integration || !integration.accessToken) {
        throw new Error('Connect your GitHub account under Integrations to deploy repository files.');
    }
    const token = integration.accessToken;

    try {
        const filled = await fillFromTarball(repo, token, stillPending, endAt);
        if (filled) console.log(`[deploy] tarball fetch resolved ${filled} file(s) from ${repo.owner}/${repo.name}`);
    } catch (err) {
        const status = err.response && err.response.status;
        console.warn(`[deploy] GitHub tarball fetch failed (${status || err.message}); falling back to per-file API.`);
    }

    const remaining = unresolved();
    if (remaining.length && Date.now() < endAt) {
        await fillFromGitHubApi(repo, token, remaining, endAt);
    }

    const missing = unresolved();
    if (missing.length === files.length) {
        throw new Error(
            'No file content to deploy: files were sent without content. Re-open the files in the editor and deploy again.'
        );
    }
    if (missing.length) {
        const sample = missing.slice(0, 5).map(fileKey).join(', ');
        throw new Error(
            `Could not fetch content for ${missing.length} file(s): ${sample}` +
            `${missing.length > 5 ? ', ...' : ''}. They may not exist in the repository yet — push them to GitHub first.`
        );
    }
}

module.exports = {
    fileKey,
    fileBytes,
    looksBinary,
    applyContent,
    validateDeployFiles,
    backfillFileContent,
    limits,
};
