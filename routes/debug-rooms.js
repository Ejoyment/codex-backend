/**
 * Debug Room API Routes
 * Ephemeral, consent-based multiplayer debug sessions (Phase 3).
 *
 * Not to be confused with routes/debug.js, which handles DAP-style
 * breakpoint/stepping debug sessions — a different feature entirely.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Company = require('../models/Company');
const debugRoomService = require('../utils/debugRoomService');
const debugRoomSocket = require('../utils/debugRoomSocket');

/**
 * A guest may only request a room from a host who shares a company with them.
 */
async function assertSharedCompany(companyId, userId) {
    const company = await Company.findById(companyId);
    if (!company) {
        const err = new Error('Company not found');
        err.status = 404;
        throw err;
    }
    const isMember = company.members.some((m) => String(m.user) === String(userId))
        || String(company.owner) === String(userId);
    if (!isMember) {
        const err = new Error('Not a member of this company');
        err.status = 403;
        throw err;
    }
}

function handleServiceError(res, error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({ success: false, message: error.message || 'Internal server error' });
}

/**
 * @swagger
 * /api/debug-rooms:
 *   post:
 *     summary: Request to join a teammate's debug session (guest triggers this)
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hostId:
 *                 type: string
 *               companyId:
 *                 type: string
 *               projectId:
 *                 type: string
 *               taskRef:
 *                 type: string
 *               workspaceId:
 *                 type: string
 *               openFiles:
 *                 type: array
 *                 items:
 *                   type: string
 *               terminalSessionId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pending room created, host notified
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { hostId, companyId, projectId, taskRef, workspaceId, openFiles, terminalSessionId } = req.body;
        await assertSharedCompany(companyId, req.userId);

        const room = await debugRoomService.createRoom({
            hostId,
            guestId: req.userId,
            companyId,
            projectId,
            taskRef,
            workspaceId,
            openFiles,
            terminalSessionId
        });

        res.status(201).json({ success: true, room });
    } catch (error) {
        handleServiceError(res, error);
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/respond:
 *   post:
 *     summary: Host approves or denies a pending join request
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approve, deny]
 *     responses:
 *       200:
 *         description: Room updated
 */
router.post('/:id/respond', authenticateToken, async (req, res) => {
    try {
        const { decision } = req.body;
        const room = await debugRoomService.respondToRoom({
            roomId: req.params.id,
            hostId: req.userId,
            decision
        });
        res.json({ success: true, room });
    } catch (error) {
        handleServiceError(res, error);
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}:
 *   get:
 *     summary: Fetch room state and participants
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Room state
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const room = await debugRoomService.getRoom(req.params.id);
        res.json({ success: true, room });
    } catch (error) {
        handleServiceError(res, error);
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/control:
 *   post:
 *     summary: Grant, revoke, or request controller rights
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetUserId:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [grant, revoke, request]
 *     responses:
 *       200:
 *         description: Room updated
 */
router.post('/:id/control', authenticateToken, async (req, res) => {
    try {
        const { targetUserId, action } = req.body;
        const room = await debugRoomService.updateControl({
            roomId: req.params.id,
            actingUserId: req.userId,
            targetUserId,
            action
        });
        res.json({ success: true, room });
    } catch (error) {
        handleServiceError(res, error);
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}:
 *   delete:
 *     summary: Close the room and wipe its snapshot pointer
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Room closed
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const room = await debugRoomService.closeRoom({
            roomId: req.params.id,
            actingUserId: req.userId
        });
        debugRoomSocket.notifyClosed(req.params.id);
        res.json({ success: true, room });
    } catch (error) {
        handleServiceError(res, error);
    }
});

module.exports = router;