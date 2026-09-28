/**
 * Sandbox API Routes
 * Provides endpoints for starting and managing code sandboxes (live preview iframes)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const CodeFile = require('../models/CodeFile');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/sandbox/start:
 *   post:
 *     summary: Start a sandbox (live preview iframe) for a code file
 *     tags:
 *       - Sandbox
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileId
 *             properties:
 *               fileId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sandbox started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sandboxUrl:
 *                   type: string
 *       400:
 *         description: Bad request - fileId is required
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
// Start a sandbox for live preview
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { fileId, file, name, path: filePath, language, content, files } = req.body;
        let payloadFile = file || null;
        if (!payloadFile && fileId && /^[0-9a-f]{24}$/i.test(String(fileId))) {
            try {
                payloadFile = await CodeFile.findById(fileId).lean();
            } catch (_) {
                payloadFile = null;
            }
        }

        if (!payloadFile && !name && !(Array.isArray(files) && files.length)) {
            return res.status(400).json({ error: 'fileId or file content is required' });
        }

        const resolvedName = payloadFile?.name || name || 'preview.html';
        const resolvedPath = (payloadFile?.path || filePath || '/').replace(/\\/g, '/');
        const resolvedLanguage = payloadFile?.language || language || (resolvedName.endsWith('.html') ? 'html' : 'javascript');
        const resolvedContent = typeof content === 'string' ? content : (payloadFile?.content || '');
        const isHtml = resolvedLanguage === 'html' || /\.(html?|xhtml)$/i.test(resolvedName);

        const sandboxKey = 'sb_' + crypto.randomBytes(8).toString('hex');
        const sandboxDir = path.join(os.tmpdir(), 'codex-sandboxes', sandboxKey);
        await fs.mkdir(sandboxDir, { recursive: true });

        // Write every provided file (entry + css/js/assets) so relative
        // references inside the preview actually resolve.
        const written = new Set();
        const safeRel = (p) => {
            const rel = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
            if (!rel || rel.split('/').includes('..')) return null;
            return rel;
        };
        const writeFileSafe = async (rel, data) => {
            const abs = path.resolve(sandboxDir, rel);
            if (!abs.startsWith(path.resolve(sandboxDir) + path.sep)) return;
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, data, 'utf8');
            written.add(rel);
        };

        if (Array.isArray(files)) {
            for (const f of files.slice(0, 200)) {
                if (!f || typeof f.content !== 'string') continue;
                const rel = safeRel(f.path);
                if (rel) await writeFileSafe(rel, f.content);
            }
        }

        let previewHtml = '';
        if (isHtml) {
            previewHtml = resolvedContent || '<html><body><p>No content</p></body></html>';
        } else {
            previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox Preview - ${resolvedName}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; padding: 2rem; margin: 0; }
  pre { white-space: pre-wrap; word-wrap: break-word; tab-size: 2; }
  .header { border-bottom: 1px solid #333; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  .file-name { color: #569cd6; font-weight: bold; }
  .language { color: #6a9955; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="header">
  <span class="file-name">${resolvedName}</span>
  <span class="language">.${resolvedLanguage}</span>
</div>
<pre><code>${resolvedContent ? resolvedContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(empty file)'}</code></pre>
</body>
</html>`;
        }

        // index.html = the entry page (served at the preview root so relative
        // css/js links resolve inside the key directory).
        await fs.writeFile(path.join(sandboxDir, 'index.html'), previewHtml, 'utf8');
        const entryRel = safeRel(resolvedPath.endsWith(`/${resolvedName}`) || resolvedPath === '/'
            ? resolvedPath
            : `${resolvedPath.replace(/\/+$/, '')}/${resolvedName}`);
        if (entryRel && isHtml && entryRel !== 'index.html' && !written.has(entryRel)) {
            await writeFileSafe(entryRel, previewHtml).catch(() => {});
        }

        const basePath = '/api/sandbox/preview';
        res.json({
            // Prefer building the URL client-side from API_BASE_URL — behind
            // Render's proxy req.protocol is http, which produced mixed-content
            // iframe URLs on the https editor.
            sandboxPath: `${basePath}/${sandboxKey}/`,
            sandboxUrl: `${process.env.SANDBOX_PUBLIC_URL || `${req.protocol}://${req.get('host')}`}${basePath}/${sandboxKey}/`,
            sandboxKey,
            source: resolvedPath,
            fileName: resolvedName,
        });
    } catch (error) {
        console.error('Sandbox start error:', error);
        res.status(500).json({ error: error.message || 'Failed to start sandbox' });
    }
});

/**
 * @swagger
 * /api/sandbox/preview/{key}:
 *   get:
 *     summary: Serve a sandbox preview page
 *     tags:
 *       - Sandbox
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Preview HTML content
 *       404:
 *         description: Sandbox not found
 */
// Serve a sandbox preview: /preview/key → index.html, plus its assets.
// NOTE: the asset route must be registered BEFORE the bare-key redirect —
// Express 4 treats trailing slashes as optional, so `/preview/key/` would
// otherwise match the redirect route first and loop forever.
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

function resolveSandboxFile(key, rel) {
    const base = path.resolve(os.tmpdir(), 'codex-sandboxes');
    const dir = path.resolve(base, String(key || ''));
    if (dir !== base && !dir.startsWith(base + path.sep)) return null;
    const abs = path.resolve(dir, String(rel || 'index.html'));
    if (abs !== dir && !abs.startsWith(dir + path.sep)) return null;
    return abs;
}

// Serve a sandbox preview
router.get('/preview/:key/*', async (req, res) => {
    try {
        const { key } = req.params;
        const rel = req.params[0] ? String(req.params[0]) : 'index.html';
        if (rel.split('/').includes('..')) {
            return res.status(403).json({ error: 'Invalid sandbox key' });
        }

        const target = resolveSandboxFile(key, rel === '' ? 'index.html' : rel);
        if (!target) return res.status(403).json({ error: 'Invalid sandbox key' });

        let filePath = target;
        try {
            const st = await fs.stat(filePath);
            if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
        } catch {
            return res.status(404).json({ error: 'Sandbox not found or expired' });
        }

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Sandbox not found or expired' });
        }

        const html = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        // The editor page is served with COEP require-corp — cross-origin
        // iframes only load if the framed response opts in via CORP.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-site');
        res.send(html);
    } catch (error) {
        console.error('Sandbox preview error:', error);
        res.status(500).json({ error: 'Failed to serve sandbox preview' });
    }
});

// Bare /preview/key → trailing slash so relative asset URLs (style.css)
// resolve inside /key/. Registered after the asset route (see note above).
router.get('/preview/:key', (req, res) => {
    res.redirect(`${req.params.key}/`);
});

module.exports = router;