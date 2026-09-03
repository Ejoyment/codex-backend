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
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({ error: 'fileId is required' });
        }

        // Verify file exists
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Generate a sandbox key and build a preview HTML page
        const sandboxKey = 'sb_' + crypto.randomBytes(8).toString('hex');

        // Determine sandbox URL - in production, this would provision a real container
        // For now, we create a self-contained HTML preview from the file content
        const sandboxDir = path.join(os.tmpdir(), 'codex-sandboxes', sandboxKey);
        await fs.mkdir(sandboxDir, { recursive: true });

        let previewHtml = '';

        if (file.language === 'html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            // Serve the HTML file directly
            previewHtml = file.content || '<html><body><p>No content</p></body></html>';
        } else {
            // Wrap code in a syntax-highlighted preview page
            previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox Preview - ${file.name}</title>
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
  <span class="file-name">${file.name}</span>
  <span class="language">.${file.language}</span>
</div>
<pre><code>${file.content ? file.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(empty file)'}</code></pre>
</body>
</html>`;
        }

        await fs.writeFile(path.join(sandboxDir, 'index.html'), previewHtml, 'utf8');

        // In a real implementation, we would start a local HTTP server for the sandbox directory
        // For now, return a preview URL pointing to the sandbox viewer
        const baseUrl = process.env.SANDBOX_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

        res.json({
            sandboxUrl: `${baseUrl}/api/sandbox/preview/${sandboxKey}`,
            sandboxKey
        });
    } catch (error) {
        console.error('Sandbox start error:', error);
        res.status(500).json({ error: 'Failed to start sandbox' });
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
        const sandboxDir = path.join(os.tmpdir(), 'codex-sandboxes', key);
        const indexPath = path.join(sandboxDir, 'index.html');

        // Validate path to prevent directory traversal
        const resolvedPath = path.resolve(indexPath);
        if (!resolvedPath.startsWith(path.resolve(os.tmpdir(), 'codex-sandboxes'))) {
            return res.status(403).json({ error: 'Invalid sandbox key' });
        }

        try {
            await fs.access(indexPath);
        } catch {
            return res.status(404).json({ error: 'Sandbox not found or expired' });
        }

        const html = await fs.readFile(indexPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Sandbox preview error:', error);
        res.status(500).json({ error: 'Failed to serve sandbox preview' });
    }
});

module.exports = router;