/**
 * Phase 3 — Debug Room REST endpoints
 * POST   /api/v1/rooms                 create + request join
 * POST   /api/v1/rooms/:id/respond     host approve/deny
 * POST   /api/v1/rooms/:id/control     grant/revoke control
 * GET    /api/v1/rooms/:id
 * DELETE /api/v1/rooms/:id
 */
const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const roomService = require('../services/roomService');

const router = express.Router();
router.use(authenticateToken);

function roomView(room) {
  return {
    id: room._id,
    hostId: room.hostId,
    workspaceId: room.workspaceId,
    taskRef: room.taskRef,
    status: room.status,
    participants: room.participants,
    pendingRequests: room.pendingRequests,
    sharedEnvKeys: room.sharedEnvKeys,
    terminalSeq: room.terminalSeq,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    lastActivityAt: room.lastActivityAt,
  };
}

// Create a room (as host) — or request to join an existing one via { joinRoomId }.
router.post('/', async (req, res) => {
  try {
    const { workspaceId, taskRef, joinRoomId } = req.body || {};
    if (joinRoomId) {
      const room = await roomService.getRoom(joinRoomId);
      if (!room || room.status === 'closed') {
        return res.status(404).json({ success: false, message: 'Room not found or closed' });
      }
      await roomService.requestJoin(room, req.userId);
      return res.json({ success: true, data: roomView(room), pending: true });
    }
    const room = await roomService.createRoom({
      hostId: req.userId,
      workspaceId: workspaceId || null,
      taskRef: taskRef || null,
    });
    res.status(201).json({ success: true, data: roomView(room) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Host approve/deny a join request: { userId, approve: boolean }
router.post('/:id/respond', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!roomService.isHost(room, req.userId)) {
      return res.status(403).json({ success: false, message: 'Only the host can respond' });
    }
    const { userId, approve } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    await roomService.respondToJoin(room, userId, !!approve);
    res.json({ success: true, data: roomView(room) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Grant/revoke controller rights: { userId, grant: boolean } — host only, instantly revocable.
router.post('/:id/control', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!roomService.isHost(room, req.userId)) {
      return res.status(403).json({ success: false, message: 'Only the host can grant control' });
    }
    const { userId, grant } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    await roomService.setControl(room, userId, !!grant);
    res.json({ success: true, data: roomView(room) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Explicit per-variable env share: { key } — host only, one variable at a time.
router.post('/:id/share-env', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!roomService.isHost(room, req.userId)) {
      return res.status(403).json({ success: false, message: 'Only the host can share env' });
    }
    const { key } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, message: 'key required' });
    }
    if (roomService.SECRET_NAME_RE.test(key)) {
      return res.status(400).json({
        success: false,
        message: 'Secret keys are never shared. Rotate the value out-of-band instead.',
      });
    }
    if (!room.sharedEnvKeys.includes(key)) {
      room.sharedEnvKeys.push(key);
      await roomService.touchActivity(room);
    }
    res.json({ success: true, data: roomView(room) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    const role = roomService.getRole(room, req.userId);
    const isHost = roomService.isHost(room, req.userId);
    if (!role && !isHost) {
      // Non-participants see minimal metadata so they can request to join.
      return res.json({
        success: true,
        data: {
          id: room._id,
          status: room.status,
          workspaceId: room.workspaceId,
          participantCount: room.participants.length,
        },
      });
    }
    res.json({ success: true, data: roomView(room), role });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Close (host) or leave (participant). Closing wipes all snapshot data.
router.delete('/:id', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (roomService.isHost(room, req.userId)) {
      const result = await roomService.closeRoom(room);
      if (req.app.get('roomSocket')) {
        req.app.get('roomSocket').broadcastClosed(req.params.id).catch(() => {});
      }
      return res.json({ success: true, data: result });
    }
    await roomService.removeParticipant(room, req.userId);
    res.json({ success: true, data: { left: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
