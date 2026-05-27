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
 * Get completions
 * POST /api/lsp/completions
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
 * Get hover information
 * POST /api/lsp/hover
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
 * Get definition
 * POST /api/lsp/definition
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
 * Get references
 * POST /api/lsp/references
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
 * Notify document change
 * POST /api/lsp/change
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
 * Close document
 * POST /api/lsp/close
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
 * Stop LSP server
 * POST /api/lsp/stop
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
 * Get language from filename
 * GET /api/lsp/language/:filename
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
