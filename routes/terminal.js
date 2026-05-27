/**
 * Terminal API Routes
 * Provides REST endpoints for terminal management
 */

const express = require('express');
const router = express.Router();
const terminalService = require('../utils/terminalService');
const { authenticateToken } = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');

/**
 * @swagger
 * /api/terminal/sessions:
 *   get:
 *     summary: Get active terminal sessions for current user
 *     tags:
 *       - Terminal API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active terminal sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                       workspaceId:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/sessions', authenticateToken, permissionMatrix.requirePermission('terminal', 'access'), (req, res) => {
  try {
    const sessions = terminalService.getActiveSessions(req.user.userId);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get terminal sessions' });
  }
});

/**
 * Get terminal statistics
 * GET /api/terminal/stats
 */
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const stats = terminalService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get terminal stats' });
  }
});

/**
 * Destroy terminal session
 * DELETE /api/terminal/:sessionId
 */
router.delete('/:sessionId', authenticateToken, permissionMatrix.requirePermission('terminal', 'access'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    await terminalService.destroy(sessionId);
    res.json({ success: true, message: 'Terminal session destroyed' });
  } catch (error) {
    console.error('Destroy terminal error:', error);
    res.status(500).json({ error: 'Failed to destroy terminal session' });
  }
});

module.exports = router;
