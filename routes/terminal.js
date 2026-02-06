/**
 * Terminal API Routes
 * Provides REST endpoints for terminal management
 */

const express = require('express');
const router = express.Router();
const terminalService = require('../utils/terminalService');
const auth = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');

/**
 * Get active terminal sessions
 * GET /api/terminal/sessions
 */
router.get('/sessions', auth, permissionMatrix.requirePermission('terminal', 'access'), (req, res) => {
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
router.get('/stats', auth, (req, res) => {
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
router.delete('/:sessionId', auth, permissionMatrix.requirePermission('terminal', 'access'), async (req, res) => {
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
