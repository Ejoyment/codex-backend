const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const DebugHandoff = require('../models/DebugHandoff');
const CodeFile = require('../models/CodeFile');
const debugAdapter = require('../utils/debugAdapter');
const crypto = require('crypto');

/**
 * @swagger
 * /api/collaboration/handoff:
 *   post:
 *     summary: Create an instant bug handoff / debug share
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
 *               companyId:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               source:
 *                 type: string
 *                 enum: [manual, debug-session, support-ticket, error-alert, ai-suggestion]
 *               sourceId:
 *                 type: string
 *               fileId:
 *                 type: string
 *               debugSessionId:
 *                 type: string
 *               ticketId:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [link, company, invited]
 *     responses:
 *       201:
 *         description: Debug handoff created
 */
router.post('/handoff', authenticateToken, async (req, res) => {
    try {
        const { companyId, title, description, source, sourceId, fileId, debugSessionId, ticketId, mode } = req.body;
        
        const codeSnapshot = { branch: 'main', commitSha: null, repository: null, filePath: null, content: null, language: null };
        
        if (fileId) {
            const file = await CodeFile.findById(fileId);
            if (file) {
                codeSnapshot.fileId = file._id.toString();
                codeSnapshot.filePath = file.path;
                codeSnapshot.content = file.content;
                codeSnapshot.language = file.language;
            }
        }
        
        let runtimeState = null;
        if (debugSessionId) {
            try {
                const session = await debugAdapter.getSession(debugSessionId);
                runtimeState = {
                    sessionId: debugSessionId,
                    variables: session.state?.variables || {},
                    callStack: session.state?.callStack || [],
                    error: session.state?.error || null,
                    envSnapshot: session.state?.env || {}
                };
            } catch (error) {
                console.error('Failed to attach debug session state:', error.message);
            }
        }
        
        const token = crypto.randomBytes(32).toString('hex');
        const handoffId = `HOF-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        
        const handoff = await DebugHandoff.create({
            handoffId,
            createdBy: req.userId,
            companyId: companyId || null,
            title: title || 'Debug Handoff',
            description: description || '',
            source: source || 'manual',
            sourceId: sourceId || null,
            codeSnapshot,
            runtimeState,
            sandbox: {
                url: `/sandbox/handoff/${handoffId}`,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                branch: `handoff/${handoffId}`,
                commitSha: 'pending',
                status: 'provisioning'
            },
            access: {
                mode: mode || 'link',
                token,
                invitedUserIds: []
            },
            linkedTicketId: ticketId || null,
            linkedMeetingId: null
        });
        
        res.status(201).json({
            success: true,
            handoff: {
                id: handoff._id,
                handoffId,
                title: handoff.title,
                source: handoff.source,
                codeSnapshot,
                runtimeState,
                sandbox: handoff.sandbox,
                access: {
                    mode: handoff.access.mode,
                    url: `/sandbox/handoff/${handoffId}?token=${token}`
                }
            }
        });
    } catch (error) {
        console.error('Create handoff error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/handoff/{handoffId}/resolve:
 *   post:
 *     summary: Mark a debug handoff as resolved
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: handoffId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Handoff resolved
 */
router.post('/handoff/:handoffId/resolve', authenticateToken, async (req, res) => {
    try {
        const handoff = await DebugHandoff.findOne({ handoffId: req.params.handoffId });
        if (!handoff) {
            return res.status(404).json({ success: false, message: 'Handoff not found' });
        }
        
        handoff.resolvedAt = new Date();
        handoff.resolvedBy = req.userId;
        if (handoff.sandbox) {
            handoff.sandbox.status = 'expired';
            handoff.sandbox.expiresAt = new Date();
        }
        await handoff.save();
        
        res.json({ success: true, message: 'Handoff resolved' });
    } catch (error) {
        console.error('Resolve handoff error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/handoff:
 *   get:
 *     summary: Get user's debug handoffs
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: query
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [provisioning, ready, expired, failed]
 *     responses:
 *       200:
 *         description: List of handoffs
 */
router.get('/handoff', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.query;
        const query = { $or: [{ createdBy: req.userId }, { 'access.invitedUserIds': req.userId }] };
        if (companyId) query.companyId = companyId;
        
        const handoffs = await DebugHandoff.find(query)
            .populate('createdBy', 'fullName email profilePicture')
            .populate('resolvedBy', 'fullName email')
            .sort({ createdAt: -1 });
            
        res.json({
            success: true,
            handoffs: handoffs.map(h => ({
                id: h._id,
                handoffId: h.handoffId,
                title: h.title,
                description: h.description,
                source: h.source,
                codeSnapshot: h.codeSnapshot,
                runtimeState: h.runtimeState,
                sandbox: h.sandbox,
                access: h.access,
                resolvedAt: h.resolvedAt,
                resolvedBy: h.resolvedBy,
                createdAt: h.createdAt
            }))
        });
    } catch (error) {
        console.error('Get handoffs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
