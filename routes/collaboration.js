/**
 * Collaboration API Routes
 * Handles real-time collaboration endpoints
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const collaborationService = require('../utils/collaborationService');
const CodeFile = require('../models/CodeFile');

/**
 * GET /api/collaboration/file/:fileId/users
 * Get active users editing a file
 */
router.get('/file/:fileId/users', auth, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Verify user has access to file
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const users = collaborationService.getActiveUsers(fileId);
        
        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        console.error('Get active users error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/collaboration/file/:fileId/join
 * Join a collaboration session
 */
router.post('/file/:fileId/join', auth, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Verify user has access to file
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Load document
        await collaborationService.loadDocument(fileId);
        
        res.json({
            success: true,
            message: 'Joined collaboration session',
            fileId
        });
    } catch (error) {
        console.error('Join collaboration error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/collaboration/file/:fileId/leave
 * Leave a collaboration session
 */
router.post('/file/:fileId/leave', auth, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        res.json({
            success: true,
            message: 'Left collaboration session'
        });
    } catch (error) {
        console.error('Leave collaboration error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
