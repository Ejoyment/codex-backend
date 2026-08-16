const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const figmaContextService = require('../utils/figmaContextService');
const aiContextEngine = require('../utils/aiContextEngine');

/**
 * @swagger
 * /api/ai-context/figma/tokens/ingest:
 *   post:
 *     summary: Ingest design tokens from a Figma file
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileKey:
 *                 type: string
 *               nodeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Design tokens ingested successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/tokens/ingest', authenticateToken, async (req, res) => {
    try {
        const { fileKey, nodeId } = req.body;
        if (!fileKey) {
            return res.status(400).json({ success: false, message: 'fileKey is required' });
        }
        
        const tokens = await figmaContextService.ingestDesignTokens(req.userId, fileKey, nodeId);
        res.json({
            success: true,
            message: `Ingested ${tokens.length} design tokens`,
            tokens: tokens.length,
            sample: tokens.slice(0, 5).map(t => ({ name: t.name, type: t.tokenType, value: t.value }))
        });
    } catch (error) {
        console.error('Figma token ingest error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/figma/tokens:
 *   get:
 *     summary: Get design tokens for AI context
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileKey
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Design tokens for code generation
 *       401:
 *         description: Unauthorized
 */
router.get('/tokens', authenticateToken, async (req, res) => {
    try {
        const { fileKey } = req.query;
        if (!fileKey) {
            return res.status(400).json({ success: false, message: 'fileKey is required' });
        }
        
        const tokens = await figmaContextService.getDesignTokensForAI(req.userId, fileKey, 'codegen');
        res.json({ success: true, ...tokens });
    } catch (error) {
        console.error('Figma tokens error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-config/cross-tool:
 *   post:
 *     summary: Build unified AI context from all connected tools
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               figmaFileKey:
 *                 type: string
 *               ticketId:
 *                 type: string
 *               techStack:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unified context built
 *       401:
 *         description: Unauthorized
 */
router.post('/cross-tool', authenticateToken, async (req, res) => {
    try {
        const { companyId, figmaFileKey, ticketId, techStack } = req.body;
        
        const context = await aiContextEngine.buildCrossToolContext(req.userId, companyId, {
            includeFigma: !!figmaFileKey,
            figmaFileKey,
            includeTeamConventions: !!companyId,
            includeTicketContext: !!ticketId,
            ticketId,
            includeIntegrations: true,
            includeCodeContext: true,
            techStack,
            contextType: 'codegen'
        });
        
        res.json({ success: true, context });
    } catch (error) {
        console.error('Cross-tool context error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
