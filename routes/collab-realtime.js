const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const CollaborationSession = require('../models/CollaborationSession');
const crypto = require('crypto');

/**
 * @swagger
 * /api/collaboration/session:
 *   post:
 *     summary: Create a realtime collaboration session for the multiplayer overlay
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [editor, sandbox, design, handoff, meeting]
 *               contextRef:
 *                 type: string
 *               companyId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created
 */
router.post('/session', authenticateToken, async (req, res) => {
    try {
        const { type, contextRef, companyId } = req.body;
        const session = await CollaborationSession.create({
            sessionId: `col_${crypto.randomBytes(8).toString('hex')}`,
            type: type || 'editor',
            contextRef: contextRef || null,
            companyId: companyId || null,
            createdBy: req.userId,
            audioChannelId: `audio_${crypto.randomBytes(6).toString('hex')}`
        });
        res.status(201).json({
            success: true,
            session: {
                sessionId: session.sessionId,
                type: session.type,
                audioChannelId: session.audioChannelId,
                participants: []
            }
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/session/{sessionId}:
 *   get:
 *     summary: Get a realtime collaboration session + participants
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session details
 */
router.get('/session/:sessionId', authenticateToken, async (req, res) => {
    try {
        const session = await CollaborationSession.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        res.json({
            success: true,
            session: {
                sessionId: session.sessionId,
                type: session.type,
                audioChannelId: session.audioChannelId,
                participants: session.participants,
                status: session.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/session/{sessionId}/end:
 *   post:
 *     summary: End a realtime collaboration session
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session ended
 */
router.post('/session/:sessionId/end', authenticateToken, async (req, res) => {
    try {
        const session = await CollaborationSession.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        if (session.createdBy.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can end session' });
        }
        session.status = 'ended';
        session.endedAt = new Date();
        await session.save();
        res.json({ success: true, message: 'Session ended' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
