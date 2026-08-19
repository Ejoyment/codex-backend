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
 * /api/ai-context/figma/context:
 *   get:
 *     summary: Get unified design context (live Figma node tree + stored design tokens + component list)
 *     description: |
 *       Returns a comprehensive design context object that combines the live
 *       Figma node structure (summarised for AI consumption), all previously
 *       ingested design tokens, and a flat list of components/instances found
 *       in the file or node.  Optimised for AI code generation and design
 *       parity workflows.
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
 *         description: Figma file key
 *       - name: nodeId
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Figma node ID to scope the context
 *       - name: contextType
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [codegen, audit]
 *           default: codegen
 *         description: Context format — 'codegen' for AI code generation, 'audit' for detailed review
 *     responses:
 *       200:
 *         description: Unified design context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 context:
 *                   type: object
 *                   properties:
 *                     fileKey:
 *                       type: string
 *                     nodeId:
 *                       type: string
 *                       nullable: true
 *                     file:
 *                       type: object
 *                     fetchedAt:
 *                       type: string
 *                       format: date-time
 *                     nodeTree:
 *                       type: object
 *                       description: Summarised Figma node tree (max depth 5)
 *                     designSystem:
 *                       type: object
 *                       description: Flattened design tokens grouped by type
 *                     tokenCount:
 *                       type: integer
 *                     components:
 *                       type: array
 *                       items:
 *                         type: object
 *                     componentCount:
 *                       type: integer
 *       400:
 *         description: Missing fileKey
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/context', authenticateToken, async (req, res) => {
    try {
        const { fileKey, nodeId, contextType } = req.query;
        if (!fileKey) {
            return res.status(400).json({ success: false, message: 'fileKey is required' });
        }

        const context = await figmaContextService.getDesignContext(
            req.userId,
            fileKey,
            nodeId || null,
            contextType || 'codegen'
        );
        res.json({ success: true, context });
    } catch (error) {
        console.error('Get design context error:', error);
        const status = error.message?.includes('Figma not connected') ? 403 : 500;
        res.status(status).json({ success: false, message: error.message });
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