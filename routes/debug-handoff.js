const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const DebugHandoff = require('../models/DebugHandoff');
const CodeFile = require('../models/CodeFile');
const EphemeralSandbox = require('../models/EphemeralSandbox');
const debugAdapter = require('../utils/debugAdapter');
const sandboxProvisioner = require('../utils/sandboxProvisioner');
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

/**
 * @swagger
 * /api/collaboration/handoff/{handoffId}/provision:
 *   post:
 *     summary: Provision the ephemeral cloud sandbox for a bug handoff
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: handoffId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Sandbox provisioning started
 */
router.post('/handoff/:handoffId/provision', authenticateToken, async (req, res) => {
    try {
        const handoff = await DebugHandoff.findOne({ handoffId: req.params.handoffId });
        if (!handoff) return res.status(404).json({ success: false, message: 'Handoff not found' });

        const existing = await EphemeralSandbox.findOne({ handoffId: handoff._id, status: { $in: ['provisioning', 'cloning', 'installing', 'starting', 'ready'] } });
        if (existing) {
            return res.json({ success: true, sandbox: existing, message: 'Sandbox already provisioning/provisioned' });
        }

        const sandbox = await sandboxProvisioner.provision(handoff);
        res.status(201).json({
            success: true,
            sandbox: {
                sandboxKey: sandbox.sandboxKey,
                status: sandbox.status,
                previewUrl: sandbox.previewUrl,
                expiresAt: sandbox.expiresAt
            },
            shareUrl: `/sandbox.html?key=${sandbox.sandboxKey}`
        });
    } catch (error) {
        console.error('Provision sandbox error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/handoff/{handoffId}/sandbox:
 *   get:
 *     summary: Get the ephemeral sandbox status for a handoff
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: handoffId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sandbox status
 */
router.get('/handoff/:handoffId/sandbox', authenticateToken, async (req, res) => {
    try {
        const handoff = await DebugHandoff.findOne({ handoffId: req.params.handoffId });
        if (!handoff) return res.status(404).json({ success: false, message: 'Handoff not found' });

        const sandbox = await EphemeralSandbox.findOne({ handoffId: handoff._id }).sort({ createdAt: -1 });
        if (!sandbox) return res.json({ success: true, sandbox: null });

        res.json({
            success: true,
            sandbox: {
                sandboxKey: sandbox.sandboxKey,
                status: sandbox.status,
                previewUrl: sandbox.previewUrl,
                ports: sandbox.ports,
                logs: sandbox.logs,
                error: sandbox.error,
                repository: sandbox.repository,
                branch: sandbox.branch,
                commitSha: sandbox.commitSha,
                envVarKeys: Object.keys(sandbox.envVars || {}),
                expiresAt: sandbox.expiresAt,
                readyAt: sandbox.readyAt
            }
        });
    } catch (error) {
        console.error('Get sandbox error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/handoff/{handoffId}/invite:
 *   post:
 *     summary: Invite users to a bug handoff sandbox
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: handoffId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userIds: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Invitees added
 */
router.post('/handoff/:handoffId/invite', authenticateToken, async (req, res) => {
    try {
        const handoff = await DebugHandoff.findOne({ handoffId: req.params.handoffId });
        if (!handoff) return res.status(404).json({ success: false, message: 'Handoff not found' });

        const { userIds = [] } = req.body;
        const unique = Array.from(new Set([...(handoff.access.invitedUserIds || []).map(String), ...userIds.map(String)]));
        handoff.access.invitedUserIds = unique;
        handoff.access.mode = 'invited';
        await handoff.save();

        res.json({ success: true, invitedUserIds: handoff.access.invitedUserIds });
    } catch (error) {
        console.error('Invite error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/handoff/from-chat:
 *   post:
 *     summary: One-click bug handoff launched from chat (creates handoff + provisions sandbox)
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
 *               title: { type: string }
 *               description: { type: string }
 *               companyId: { type: string }
 *               channelId: { type: string }
 *               fileId: { type: string }
 *               debugSessionId: { type: string }
 *               ticketId: { type: string }
 *               mode: { type: string, enum: [link, company, invited] }
 *     responses:
 *       201:
 *         description: Handoff created and sandbox provisioning
 */
router.post('/handoff/from-chat', authenticateToken, async (req, res) => {
    try {
        const { title, description, companyId, channelId, fileId, debugSessionId, ticketId, mode } = req.body;

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
            } catch (e) { console.error('Debug session attach failed:', e.message); }
        }

        const token = crypto.randomBytes(32).toString('hex');
        const handoffId = `HOF-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const handoff = await DebugHandoff.create({
            handoffId,
            createdBy: req.userId,
            companyId: companyId || null,
            title: title || 'Bug Handoff',
            description: description || '',
            source: { type: 'support-ticket' },
            sourceId: channelId || ticketId || null,
            codeSnapshot,
            runtimeState,
            sandbox: { url: `/sandbox.html?key=pending`, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), branch: codeSnapshot.branch, commitSha: 'pending', status: 'provisioning' },
            access: { mode: mode || 'link', token, invitedUserIds: [] },
            linkedTicketId: ticketId || null
        });

        const sandbox = await sandboxProvisioner.provision(handoff);

        res.status(201).json({
            success: true,
            handoffId,
            sandboxKey: sandbox.sandboxKey,
            sandboxStatus: sandbox.status,
            shareUrl: `/sandbox.html?key=${sandbox.sandboxKey}`,
            previewUrl: sandbox.previewUrl
        });
    } catch (error) {
        console.error('Handoff from chat error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/sandbox/{sandboxKey}:
 *   get:
 *     summary: Get an ephemeral sandbox by its key (viewer endpoint)
 *     tags:
 *       - Collaboration Overlay
 *     parameters:
 *       - name: sandboxKey
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sandbox status
 */
router.get('/sandbox/:sandboxKey', async (req, res) => {
    try {
        const sandbox = await EphemeralSandbox.findOne({ sandboxKey: req.params.sandboxKey });
        if (!sandbox) return res.status(404).json({ success: false, message: 'Sandbox not found' });
        res.json({
            success: true,
            sandbox: {
                sandboxKey: sandbox.sandboxKey,
                status: sandbox.status,
                previewUrl: sandbox.previewUrl,
                ports: sandbox.ports,
                logs: sandbox.logs,
                error: sandbox.error,
                repository: sandbox.repository,
                branch: sandbox.branch,
                commitSha: sandbox.commitSha,
                envVarKeys: Object.keys(sandbox.envVars || {}),
                files: (sandbox.files || []).map(f => ({ path: f.path, language: f.language })),
                expiresAt: sandbox.expiresAt,
                readyAt: sandbox.readyAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
