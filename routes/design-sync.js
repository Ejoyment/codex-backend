const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const DesignSyncSession = require('../models/DesignSyncSession');
const Integration = require('../models/Integration');
const { parseFigmaNode, extractCodeDesignValues, computeParity } = require('../utils/designParity');
const realtimeBus = require('../utils/realtimeBus');
const crypto = require('crypto');
const axios = require('axios');

async function getFigmaNode(userId, fileKey, nodeId) {
    const integration = await Integration.findOne({ userId, provider: 'figma', isActive: true });
    if (!integration) return null;
    const resp = await axios.get(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
        { headers: { Authorization: `Bearer ${integration.accessToken}` } }
    );
    return resp.data.nodes?.[nodeId] || null;
}

/**
 * @swagger
 * /api/collaboration/design-sync:
 *   post:
 *     summary: Create a Live Design-Code Split View session
 *     tags:
 *       - Design Sync
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId: { type: string }
 *               figmaFileKey: { type: string }
 *               nodeId: { type: string }
 *               codeFileId: { type: string }
 *               codeLanguage: { type: string }
 *     responses:
 *       201:
 *         description: Design sync session created
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { companyId, figmaFileKey, nodeId, codeFileId, codeLanguage } = req.body;
        const session = await DesignSyncSession.create({
            sessionId: `ds_${crypto.randomBytes(8).toString('hex')}`,
            companyId: companyId || null,
            createdBy: req.userId,
            figmaFileKey: figmaFileKey || null,
            nodeId: nodeId || null,
            codeFileId: codeFileId || null,
            codeLanguage: codeLanguage || 'plaintext'
        });
        res.status(201).json({
            success: true,
            session: {
                sessionId: session.sessionId,
                figmaFileKey: session.figmaFileKey,
                nodeId: session.nodeId,
                codeFileId: session.codeFileId,
                parity: session.parity
            }
        });
    } catch (error) {
        console.error('Create design sync error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/design-sync/{sessionId}:
 *   get:
 *     summary: Get a design sync session
 *     tags:
 *       - Design Sync
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
router.get('/:sessionId', authenticateToken, async (req, res) => {
    try {
        const session = await DesignSyncSession.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        res.json({
            success: true,
            session: {
                sessionId: session.sessionId,
                figmaFileKey: session.figmaFileKey,
                nodeId: session.nodeId,
                figmaNodeName: session.figmaNodeName,
                codeFileId: session.codeFileId,
                codeLanguage: session.codeLanguage,
                parity: session.parity,
                status: session.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/design-sync/{sessionId}/parity:
 *   post:
 *     summary: Compute design parity for the current code vs the linked Figma node
 *     tags:
 *       - Design Sync
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
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
 *               code: { type: string }
 *               figmaNode: { type: object }
 *     responses:
 *       200:
 *         description: Parity analysis
 */
router.post('/:sessionId/parity', authenticateToken, async (req, res) => {
    try {
        const session = await DesignSyncSession.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

        const { code, figmaNode } = req.body || {};
        const codeValues = extractCodeDesignValues(code, session.codeLanguage);

        let figmaValues;
        if (figmaNode) {
            figmaValues = parseFigmaNode(figmaNode);
        } else if (session.figmaFileKey && session.nodeId) {
            const node = await getFigmaNode(req.userId, session.figmaFileKey, session.nodeId);
            if (!node) {
                return res.status(422).json({ success: false, message: 'Figma not connected or node unavailable. Pass figmaNode explicitly.' });
            }
            figmaValues = parseFigmaNode(node);
            session.figmaNodeName = node.name || session.figmaNodeName;
        } else {
            return res.status(400).json({ success: false, message: 'No Figma node linked to this session.' });
        }

        const parity = computeParity(figmaValues, codeValues);
        session.parity = {
            score: parity.score,
            checkedAt: new Date(),
            items: parity.items
        };
        session.codeLanguage = session.codeLanguage || 'plaintext';
        await session.save();

        const payload = { sessionId: session.sessionId, parity: session.parity };
        realtimeBus.emitCollab(`session:${session.sessionId}`, 'design:parity', payload);

        res.json({ success: true, ...payload });
    } catch (error) {
        console.error('Parity compute error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/design-sync/{sessionId}/parity:
 *   get:
 *     summary: Get the latest parity analysis for a session
 *     tags:
 *       - Design Sync
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Latest parity
 */
router.get('/:sessionId/parity', authenticateToken, async (req, res) => {
    try {
        const session = await DesignSyncSession.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        res.json({ success: true, parity: session.parity || { score: 0, items: [] } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
