/**
 * Agent Confirmation Routes
 * Handles human-in-the-loop confirmation responses
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { assertWorkspaceAccess } = require('../utils/workspaceAuth');

/**
 * @swagger
 * /api/agent-confirmation/pending:
 *   get:
 *     summary: Get pending agent confirmations
 *     tags:
 *       - Agent Confirmation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending confirmations retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/pending', authenticateToken, async (req, res) => {
    try {
        const agentOrchestrator = require('../utils/agentOrchestrator');
        const userId = req.userId || (req.user && (req.user.userId || req.user._id));
        const pending = agentOrchestrator.hitlGates.getPendingConfirmations(String(userId));
        
        res.json({
            success: true,
            confirmations: pending
        });
    } catch (error) {
        console.error('Error fetching pending confirmations:', error);
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/agent-confirmation/respond:
 *   post:
 *     summary: Respond to agent confirmation request
 *     tags:
 *       - Agent Confirmation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               confirmationId:
 *                 type: string
 *               approved:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Confirmation response processed
 *       400:
 *         description: Missing confirmationId
 *       401:
 *         description: Unauthorized
 */
router.post('/respond', authenticateToken, async (req, res) => {
    try {
        const { confirmationId, approved, reason } = req.body;
        
        if (!confirmationId) {
            return res.status(400).json({
                success: false,
                error: 'confirmationId is required'
            });
        }
        
        const agentOrchestrator = require('../utils/agentOrchestrator');
        const userId = req.userId || (req.user && (req.user.userId || req.user._id));
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const pending = agentOrchestrator.hitlGates.getPendingConfirmation(confirmationId);
        if (!pending || String(pending.userId) !== String(userId)) {
            return res.status(404).json({
                success: false,
                error: 'Confirmation not found or expired'
            });
        }

        if (pending.workspaceId) {
            const access = await assertWorkspaceAccess(pending.workspaceId, userId);
            if (!access.ok) {
                return res.status(403).json({
                    success: false,
                    error: access.reason || 'Workspace access denied'
                });
            }
        }

        const result = agentOrchestrator.hitlGates.handleConfirmationResponse(
            confirmationId,
            approved === true,
            reason
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error responding to confirmation:', error);
        return sendInternalError(req, res, error);
    }
});

module.exports = router;
