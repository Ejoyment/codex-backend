/**
 * Deployment file resolution + validation.
 *
 * - validateDeployFiles: path safety + secret checks that run BEFORE a
 *   deployment is created. There is no file-count or size ceiling.
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
        // Deployments have no file-count or total-size ceiling. The only
        // bound is how long content backfill may spend resolving missing
        // bytes from the project DB / GitHub before the deploy timeout wins.
        backfillTimeoutMs: capInt('DEPLOY_BACKFILL_TIMEOUT_MS', 600000),
    };
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

// Stylesheets are the one file class a deployment cannot recover from if it is
// missing: the markup still ships, so the site loads unstyled instead of
// failing loudly. Matched by extension because language tags are inconsistent
// across the editor, the agent and GitHub tree listings.
const STYLESHEET_EXT_RE = /\.(css|scss|sass|less|styl)$/i;

function isStylesheet(file) {
    const name = String(file?.name || '');
    if (STYLESHEET_EXT_RE.test(name)) return true;
    // GitHub tree / editor entries sometimes carry only the full path.
    const rel = String(file?.path || '').replace(/\\/g, '/');
    const base = rel.split('/').filter(Boolean).pop() || '';
    return STYLESHEET_EXT_RE.test(base);
}

/**
 * Append project stylesheets that the caller left out of the payload.
 *
 * The deploy form sends the editor's current buffers; a stylesheet that was
 * never opened (or was created after the explorer loaded) could be absent even
 * though it exists in the project, which publishes an unstyled site. Only
 * missing files are added, so unsaved buffer content always wins.
 */
function appendMissingStylesheets(files, projectFiles) {
    const list = Array.isArray(files) ? files : [];
    if (!Array.isArray(projectFiles) || projectFiles.length === 0) return list;

    const present = new Set(list.map((f) => fileKey(f)));
    const extras = [];
    for (const file of projectFiles) {
        if (!file) continue;
        const rawPath = typeof file.path === 'string' ? file.path : '';
        const rawName = typeof file.name === 'string' ? file.name : '';
        if (!rawName && !rawPath) continue;
        const name = rawName || rawPath.split('/').filter(Boolean).pop();
        const entry = { ...file, name };
        if (!isStylesheet(entry)) continue;
        const key = fileKey(entry);
        if (present.has(key)) continue;
        present.add(key);
        extras.push({
            name,
            path: rawPath || '/',
            content: typeof file.content === 'string' ? file.content : '',
            language: file.language || 'css',
            encoding: file.encoding === 'base64' ? 'base64' : undefined,
        });
    }
    return extras.length ? [...list, ...extras] : list;
}

function storedFileEntry(file) {
    const rawPath = typeof file.path === 'string' ? file.path : '';
    const rawName = typeof file.name === 'string' ? file.name : '';
    const name = rawName || rawPath.split('/').filter(Boolean).pop() || '';
    return {
        name,
        path: rawPath || '/',
        content: typeof file.content === 'string' ? file.content : '',
        language: file.language || 'plaintext',
        encoding: file.encoding === 'base64' ? 'base64' : undefined,
        contentOmitted: file.contentOmitted === true,
        size: Number.isFinite(file.size) ? file.size : undefined,
    };
}

/**
 * Merge a project's stored files into the payload the browser sent.
 *
 * The editor sends its current buffers, but files it never opened arrive as
 * metadata only (`content: ''`, `_resolved: false`). Deploying those as-is
 * publishes empty files — most visibly a stylesheet, which leaves the site
 * looking unstyled while every other file works. Stored content therefore
 * fills empty entries and every stored file missing from the payload is
 * appended, so a deploy always contains the whole project.
 *
 * Precedence: unsaved browser content (`_resolved` or non-empty) always wins;
 * an intentionally empty file (`_resolved: true` with `content: ''`) stays
 * empty. Only files belonging to this project are supplied by the caller,
 * which has already verified project ownership.
 */
function mergeProjectFiles(files, projectFiles) {
    const list = Array.isArray(files) ? files : [];
    if (!Array.isArray(projectFiles) || projectFiles.length === 0) return list;

    const storedByKey = new Map();
    for (const file of projectFiles) {
        if (!file) continue;
        const entry = storedFileEntry(file);
        if (!entry.name) continue;
        storedByKey.set(fileKey(entry), entry);
    }

    const seen = new Set();
    const merged = list.map((file) => {
        const key = fileKey(file);
        seen.add(key);
        const stored = storedByKey.get(key);
        const hasContent = typeof file.content === 'string' && file.content !== '';
        // Buffer content (including an intentional empty file) is final.
        if (!stored || file._resolved === true || hasContent) return file;
        if (stored.contentOmitted) {
            // The file exists but its bytes live in the repository, not the
            // DB. Keep it pending so backfill can fetch the real content.
            return {
                ...file,
                contentOmitted: true,
                encoding: file.encoding || stored.encoding,
                size: file.size ?? stored.size,
            };
        }
        return {
            ...file,
            content: stored.content,
            language: file.language || stored.language,
            encoding: stored.encoding,
            size: stored.size,
            contentOmitted: false,
            _resolved: true,
        };
    });

    for (const [key, stored] of storedByKey) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (stored.contentOmitted) {
            merged.push({ ...stored, content: '', _resolved: undefined });
        } else {
            merged.push({ ...stored, _resolved: true });
        }
    }

    return merged;
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
//
// There is intentionally no file-count, per-file or total-size limit: a
// repository of any size must deploy. Only safety rules remain (path traversal,
// shell/control characters, secret files).
function validateDeployFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('Project has no deployable files.');
    }
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
        const baseName = rel.split('/').pop();
        const isEnvSecret = /^\.env(\.|$)/i.test(baseName)
            && !/^\.env\.(example|sample|template)$/i.test(baseName);
        if (isEnvSecret || baseName === '.npmrc' || baseName === '.netrc') {
            throw new Error(`Refusing to deploy secret file "${rel}". Remove it or use a deployment secret instead.`);
        }
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
            timeout: Math.max(5000, Math.min(600000, endAt - Date.now())),
            maxRedirects: 5,
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
            timeout: Math.max(30000, Math.min(600000, endAt - Date.now())),
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
async function backfillFileContent({ userId, projectId, workspaceId, personal = false, source, repo, files, deadline }) {
    const { backfillTimeoutMs } = limits();
    const endAt = deadline || (Date.now() + backfillTimeoutMs);
    // A file is pending when it has no content and is not an intentional empty
    // buffer, OR when the DB intentionally omitted its bytes because they did
    // not fit in a MongoDB document.
    const unresolved = () => files.filter((f) => (
        !f._resolved && (f.contentOmitted === true || !f.content)
    ));
    if (!unresolved().length) return;

    // 1) Project files: merge content from the CodeFile collection (the
    // project file list API is metadata-only). A record with content '' is a
    // genuinely empty file — resolved, not pending. The project was already
    // proven to belong to the caller, so `project` is the correct boundary:
    // filtering by the project's workspace as well hid files whose `company`
    // no longer matched (moved projects, agent/terminal writes), which is how
    // stylesheets ended up deployed as empty files.
    if (projectId) {
        const dbFiles = await CodeFile.find({ project: projectId }).lean();
        const byKey = new Map();
        for (const dbf of dbFiles) {
            byKey.set(fileKey(dbf), dbf);
        }
        for (const f of unresolved()) {
            const stored = byKey.get(fileKey(f));
            if (!stored) continue;
            if (stored.contentOmitted) {
                // Bytes deliberately live outside MongoDB; fetch them below.
                f.contentOmitted = true;
                if (stored.encoding === 'base64') f.encoding = 'base64';
                if (Number.isFinite(stored.size)) f.size = stored.size;
                continue;
            }
            f.content = typeof stored.content === 'string' ? stored.content : '';
            if (stored.encoding === 'base64') f.encoding = 'base64';
            if (Number.isFinite(stored.size)) f.size = stored.size;
            f.contentOmitted = false;
            f._resolved = true;
        }
        if (!unresolved().length) return;
    }

    const stillPending = unresolved();

    if (!repo || !repo.owner || !repo.name) {
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

    // 2) GitHub repo deploy (also used for project deploys whose omitted or
    // binary files were never stored in MongoDB).
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

/**
 * Build a GitHub repo reference from a project/deployment record. Deployment
 * needs the repo even when the browser sends only a projectId (the wizard
 * redeploy path), so omitted/binary files can be streamed from GitHub.
 */
function repoRefFromProject(project) {
    if (!project) return null;
    const raw = String(
        project.githubRepoName || project.repoFullName || project.githubRepoUrl || ''
    ).trim();
    if (!raw) return null;

    let fullName = raw;
    const urlMatch = raw.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
    if (urlMatch) {
        fullName = `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/i, '')}`;
    } else {
        fullName = fullName
            .replace(/^https?:\/\/[^/]+\//i, '')
            .replace(/\.git$/i, '')
            .replace(/^\/+|\/+$/g, '');
    }

    const [owner, name] = fullName.split('/');
    if (!owner || !name) return null;
    return {
        owner,
        name,
        fullName: `${owner}/${name}`,
        defaultBranch: project.defaultBranch || null,
    };
}

module.exports = {
    fileKey,
    fileBytes,
    looksBinary,
    applyContent,
    isStylesheet,
    appendMissingStylesheets,
    mergeProjectFiles,
    validateDeployFiles,
    backfillFileContent,
    repoRefFromProject,
    limits,
};
