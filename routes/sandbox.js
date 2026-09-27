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
const Company = require('../models/Company');
const { authenticateToken } = require('../middleware/auth');

// Escape HTML special chars to prevent XSS when interpolating into preview HTML.
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
    }[c]));
}

const MAX_CONTENT_BYTES = 500 * 1024; // 500KB
const MAX_NAME_LENGTH = 128;
const NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const ALLOWED_LANGUAGES = ['html', 'javascript', 'python', 'plaintext', 'css', 'json'];
const SANDBOX_KEY_PATTERN = /^sb_[0-9a-f]{16}$/;

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
        const { fileId, file, name, path: filePath, language, content } = req.body;

        // Input caps: reject oversized / malformed inputs before doing any work.
        if (typeof content === 'string' && Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
            return res.status(400).json({ error: 'content exceeds maximum size of 500KB' });
        }
        for (const candidateName of [name, file?.name]) {
            if (typeof candidateName === 'string' && (candidateName.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(candidateName))) {
                return res.status(400).json({ error: 'invalid file name' });
            }
        }
        if (typeof language === 'string' && !ALLOWED_LANGUAGES.includes(language)) {
            return res.status(400).json({ error: 'unsupported language' });
        }

        const inlineFile = file || null;
        const dbFile = fileId ? await CodeFile.findById(fileId).lean() : null;

        if (fileId && !dbFile && !inlineFile && typeof content !== 'string') {
            return res.status(404).json({ error: 'File not found' });
        }

        // Ownership check: a stored file scoped to a company (workspace) may only
        // be previewed by members/owner of that company. Personal files without
        // company scoping keep the previous behavior (allowed).
        if (dbFile && (dbFile.company || dbFile.companyId)) {
            const company = await Company.findById(dbFile.company || dbFile.companyId).select('members owner').lean();
            const uid = String(req.userId);
            const members = (company && company.members) || [];
            const isMember = company && (members.some((m) => String(m.user || m.userId) === uid) || String(company.owner) === uid);
            if (!isMember) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const payloadFile = inlineFile || dbFile;

        if (!payloadFile && !name) {
            return res.status(400).json({ error: 'fileId or file content is required' });
        }

        const resolvedName = payloadFile?.name || name || 'preview.html';
        const resolvedPath = (payloadFile?.path || filePath || '/').replace(/\\/g, '/');
        let resolvedLanguage = payloadFile?.language || language || (resolvedName.endsWith('.html') ? 'html' : 'javascript');
        if (!ALLOWED_LANGUAGES.includes(resolvedLanguage)) {
            resolvedLanguage = 'plaintext';
        }
        const resolvedContent = typeof content === 'string' ? content : (payloadFile?.content || '');

        const sandboxKey = 'sb_' + crypto.randomBytes(8).toString('hex');
        const sandboxDir = path.join(os.tmpdir(), 'codex-sandboxes', sandboxKey);
        await fs.mkdir(sandboxDir, { recursive: true });

        let previewHtml = '';
        if (resolvedLanguage === 'html' || resolvedName.endsWith('.html') || resolvedName.endsWith('.htm')) {
            previewHtml = resolvedContent || '<html><body><p>No content</p></body></html>';
        } else {
            previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox Preview - ${escapeHtml(resolvedName)}</title>
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
  <span class="file-name">${escapeHtml(resolvedName)}</span>
  <span class="language">.${escapeHtml(resolvedLanguage)}</span>
</div>
<pre><code>${resolvedContent ? resolvedContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(empty file)'}</code></pre>
</body>
</html>`;
        }

        await fs.writeFile(path.join(sandboxDir, 'index.html'), previewHtml, 'utf8');

        const baseUrl = process.env.SANDBOX_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

        res.json({
            sandboxUrl: `${baseUrl}/api/sandbox/preview/${sandboxKey}`,
            sandboxKey,
            source: resolvedPath,
            fileName: resolvedName,
        });
    } catch (error) {
        console.error('Sandbox start error:', error);
        res.status(500).json({ error: 'Failed to render preview' });
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
// Serve a sandbox preview
router.get('/preview/:key', async (req, res) => {
    try {
        const { key } = req.params;
        if (typeof key !== 'string' || !SANDBOX_KEY_PATTERN.test(key)) {
            return res.status(404).json({ error: 'Sandbox not found or expired' });
        }
        const sandboxDir = path.join(os.tmpdir(), 'codex-sandboxes', key);
        const indexPath = path.join(sandboxDir, 'index.html');

        // Validate path to prevent directory traversal
        const resolvedPath = path.resolve(indexPath);
        if (!resolvedPath.startsWith(path.resolve(os.tmpdir(), 'codex-sandboxes') + path.sep)) {
            return res.status(403).json({ error: 'Invalid sandbox key' });
        }

        try {
            await fs.access(indexPath);
        } catch {
            return res.status(404).json({ error: 'Sandbox not found or expired' });
        }

        const html = await fs.readFile(indexPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(html);
    } catch (error) {
        console.error('Sandbox preview error:', error);
        res.status(500).json({ error: 'Failed to serve sandbox preview' });
    }
});

module.exports = router;