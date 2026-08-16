const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ticketCodeBridge = require('../utils/ticketCodeBridge');
const SupportTicket = require('../models/SupportTicket');

/**
 * @swagger
 * /api/ai-context/tickets/{ticketId}/analyze:
 *   post:
 *     summary: Analyze a support ticket and link to code context
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket analyzed
 *       401:
 *         description: Unauthorized
 */
router.post('/tickets/:ticketId/analyze', authenticateToken, async (req, res) => {
    try {
        const analysis = await ticketCodeBridge.analyzeTicket(req.params.ticketId, req.userId);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('Ticket analysis error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/tickets/{ticketId}/fix:
 *   post:
 *     summary: Generate a fix for an analyzed support ticket
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fix generated
 *       401:
 *         description: Unauthorized
 */
router.post('/tickets/:ticketId/fix', authenticateToken, async (req, res) => {
    try {
        const analysis = await ticketCodeBridge.generateTicketFix(req.params.ticketId, req.userId);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('Ticket fix error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/tickets/{ticketId}/sandbox:
 *   post:
 *     summary: Create a sandbox environment for a ticket fix
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sandbox created
 *       401:
 *         description: Unauthorized
 */
router.post('/tickets/:ticketId/sandbox', authenticateToken, async (req, res) => {
    try {
        const sandbox = await ticketCodeBridge.createTicketSandbox(req.params.ticketId, req.userId);
        res.json({ success: true, sandbox });
    } catch (error) {
        console.error('Sandbox creation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/tickets/analyses:
 *   get:
 *     summary: Get user's ticket analyses
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, analyzing, completed, failed]
 *     responses:
 *       200:
 *         description: List of ticket analyses
 *       401:
 *         description: Unauthorized
 */
router.get('/tickets/analyses', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        const analyses = await ticketCodeBridge.getTicketAnalyses(req.userId, status);
        res.json({ success: true, analyses });
    } catch (error) {
        console.error('Get analyses error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
