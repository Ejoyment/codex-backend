/**
 * LSP API Routes
 * Provides Language Server Protocol endpoints for real-time IntelliSense
 */

const express = require('express');
const router = express.Router();
const lspManager = require('../utils/lspManager');
const { authenticateToken } = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');

/**
 * @swagger
 * /api/lsp/start:
 *   post:
 *     summary: Start Language Server Protocol server for a specific language
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *             properties:
 *               language:
 *                 type: string
 *                 description: Programming language (e.g., javascript, python, typescript)
 *     responses:
 *       200:
 *         description: LSP server started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { language } = req.body;
    const userId = req.user.userId;

    if (!language) {
      return res.status(400).json({ error: 'Language is required' });
    }

    const result = await lspManager.startServer(userId, language);
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('LSP start error:', error);
    res.status(500).json({ error: 'Failed to start LSP server' });
  }
});

/**
 * @swagger
 * /api/lsp/completions:
 *   post:
 *     summary: Get code completions from Language Server
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - position
 *               - content
 *               - language
 *             properties:
 *               documentUri:
 *                 type: string
 *                 example: file:///test.js
 *               position:
 *                 type: object
 *                 properties:
 *                   line:
 *                     type: integer
 *                   character:
 *                     type: integer
 *               content:
 *                 type: string
 *               language:
 *                 type: string
 *                 example: javascript
 *     responses:
 *       200:
 *         description: Completions retrieved successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/completions', authenticateToken, permissionMatrix.requirePermission('lsp', 'completions'), async (req, res) => {
  try {
    const { documentUri, position, content, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !position || !content || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const completions = await lspManager.getCompletions(
      userId,
      language,
      documentUri,
      position,
      content
    );

    res.json({ completions });
  } catch (error) {
    console.error('LSP completions error:', error);
    res.status(500).json({ error: 'Failed to get completions' });
  }
});

/**
 * @swagger
 * /api/lsp/hover:
 *   post:
 *     summary: Get hover information for code symbol
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - position
 *               - content
 *               - language
 *             properties:
 *               documentUri:
 *                 type: string
 *               position:
 *                 type: object
 *               content:
 *                 type: string
 *               language:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hover information retrieved
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/hover', authenticateToken, permissionMatrix.requirePermission('lsp', 'hover'), async (req, res) => {
  try {
    const { documentUri, position, content, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !position || !content || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hover = await lspManager.getHover(
      userId,
      language,
      documentUri,
      position,
      content
    );

    res.json({ hover });
  } catch (error) {
    console.error('LSP hover error:', error);
    res.status(500).json({ error: 'Failed to get hover information' });
  }
});

/**
 * @swagger
 * /api/lsp/definition:
 *   post:
 *     summary: Get definition location for code symbol
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - position
 *               - content
 *               - language
 *     responses:
 *       200:
 *         description: Definition retrieved
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/definition', authenticateToken, permissionMatrix.requirePermission('lsp', 'definition'), async (req, res) => {
  try {
    const { documentUri, position, content, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !position || !content || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const definition = await lspManager.getDefinition(
      userId,
      language,
      documentUri,
      position,
      content
    );

    res.json({ definition });
  } catch (error) {
    console.error('LSP definition error:', error);
    res.status(500).json({ error: 'Failed to get definition' });
  }
});

/**
 * @swagger
 * /api/lsp/references:
 *   post:
 *     summary: Get all references to a code symbol
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - position
 *               - content
 *               - language
 *     responses:
 *       200:
 *         description: References retrieved
 *       401:
 *         description: Unauthorized
 */
router.post('/references', authenticateToken, permissionMatrix.requirePermission('lsp', 'references'), async (req, res) => {
  try {
    const { documentUri, position, content, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !position || !content || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const references = await lspManager.getReferences(
      userId,
      language,
      documentUri,
      position,
      content
    );

    res.json({ references });
  } catch (error) {
    console.error('LSP references error:', error);
    res.status(500).json({ error: 'Failed to get references' });
  }
});

/**
 * @swagger
 * /api/lsp/change:
 *   post:
 *     summary: Notify document change to Language Server
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - content
 *               - language
 *     responses:
 *       200:
 *         description: Document change notified
 *       401:
 *         description: Unauthorized
 */
router.post('/change', authenticateToken, async (req, res) => {
  try {
    const { documentUri, content, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !content || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await lspManager.didChangeDocument(userId, language, documentUri, content);
    res.json({ success: true });
  } catch (error) {
    console.error('LSP change error:', error);
    res.status(500).json({ error: 'Failed to notify document change' });
  }
});

/**
 * @swagger
 * /api/lsp/close:
 *   post:
 *     summary: Close document in Language Server
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - language
 *     responses:
 *       200:
 *         description: Document closed
 *       401:
 *         description: Unauthorized
 */
router.post('/close', authenticateToken, async (req, res) => {
  try {
    const { documentUri, language } = req.body;
    const userId = req.user.userId;

    if (!documentUri || !language) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await lspManager.didCloseDocument(userId, language, documentUri);
    res.json({ success: true });
  } catch (error) {
    console.error('LSP close error:', error);
    res.status(500).json({ error: 'Failed to close document' });
  }
});

/**
 * @swagger
 * /api/lsp/stop:
 *   post:
 *     summary: Stop Language Server for a language
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *             properties:
 *               language:
 *                 type: string
 *                 example: javascript
 *     responses:
 *       200:
 *         description: LSP server stopped
 *       401:
 *         description: Unauthorized
 */
router.post('/stop', authenticateToken, async (req, res) => {
  try {
    const { language } = req.body;
    const userId = req.user.userId;

    if (!language) {
      return res.status(400).json({ error: 'Language is required' });
    }

    const result = await lspManager.stopServer(userId, language);
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('LSP stop error:', error);
    res.status(500).json({ error: 'Failed to stop LSP server' });
  }
});

/**
 * @swagger
 * /api/lsp/language/{filename}:
 *   get:
 *     summary: Get programming language from filename extension
 *     tags:
 *       - LSP API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: filename
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: test.js
 *     responses:
 *       200:
 *         description: Language detected
 *       404:
 *         description: Language not supported
 *       401:
 *         description: Unauthorized
 */
router.get('/language/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    const language = lspManager.getLanguageFromExtension(filename);
    
    if (language) {
      res.json({ language });
    } else {
      res.status(404).json({ error: 'Language not supported' });
    }
  } catch (error) {
    console.error('LSP language detection error:', error);
    res.status(500).json({ error: 'Failed to detect language' });
  }
});

module.exports = router;
