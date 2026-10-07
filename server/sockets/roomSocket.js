/**
 * Phase 3 — roomSocket
 * Socket.IO namespace for ephemeral debug rooms.
 *
 * Events:
 *  - room:join        { roomId }                    -> join socket room, presence update
 *  - room:signal      { roomId, to?, data }         -> WebRTC offer/answer/ICE (relayed, host-mediated)
 *  - room:terminal-chunk { roomId, seq, chunk }     -> host-owned sequenced terminal stream (fallback relay)
 *  - room:terminal-resync { roomId, fromSeq }       -> guest asks host to resend from sequence number
 *  - room:control-request { roomId }                -> guest asks host for controller rights
 *  - room:closed      { roomId }                    -> broadcast on close
 *
 * Terminal output is NOT synced via CRDT — the host owns an ordered event
 * stream; guests resync from a sequence number on reconnect.
 * Guests are read-only by default; only controller/host may publish input.
 */

const jwt = require('jsonwebtoken');
const roomService = require('../services/roomService');

// Per-chunk cap: the ring buffer caps chunk COUNT (500), so without a byte
// cap one client could park ~500MB in memory with 1MB chunks.
const MAX_CHUNK_BYTES = 64 * 1024;

// In-memory terminal ring buffers: roomId -> { seq, chunks: [{ seq, chunk, ts }] }
const terminalBuffers = new Map();
const TERMINAL_BUFFER_CAP = 500;

function getBuffer(roomId) {
  let b = terminalBuffers.get(roomId);
  if (!b) {
    b = { seq: 0, chunks: [] };
    terminalBuffers.set(roomId, b);
  }
  return b;
}

function pushChunk(roomId, chunk) {
  const b = getBuffer(roomId);
  b.seq += 1;
  const entry = { seq: b.seq, chunk: String(chunk), ts: Date.now() };
  b.chunks.push(entry);
  if (b.chunks.length > TERMINAL_BUFFER_CAP) b.chunks.splice(0, b.chunks.length - TERMINAL_BUFFER_CAP);
  return entry;
}

function chunksFrom(roomId, fromSeq) {
  const b = terminalBuffers.get(roomId);
  if (!b) return { seq: 0, chunks: [] };
  return { seq: b.seq, chunks: b.chunks.filter((c) => c.seq > (fromSeq || 0)) };
}

function clearBuffer(roomId) {
  terminalBuffers.delete(roomId);
}

module.exports = (io) => {
  const ns = io.of('/rooms');

  ns.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId || decoded.id || decoded._id;
      socket.user = { ...decoded, id: socket.userId };
      next();
    } catch (e) {
      next(new Error('Authentication error'));
    }
  });

  ns.on('connection', (socket) => {
    // Rooms this socket actually joined (room:join is the authorized join;
    // every other handler additionally re-checks roomService.getRole).
    // Used to stop non-participants from broadcasting presence via room:leave.
    const joinedRooms = new Set();

    socket.on('room:join', async ({ roomId } = {}) => {
      try {
        if (!roomId) return socket.emit('room:error', { message: 'roomId required' });
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') {
          return socket.emit('room:error', { message: 'Room not found or closed' });
        }
        const role = roomService.getRole(room, socket.userId);
        if (!role) return socket.emit('room:error', { message: 'Not a participant' });
        socket.join(`room:${roomId}`);
        joinedRooms.add(roomId);
        await roomService.touchActivity(room);
        const { seq } = chunksFrom(roomId, 0);
        socket.emit('room:joined', { roomId, role, terminalSeq: seq });
        socket.to(`room:${roomId}`).emit('room:presence', { userId: socket.userId, role, joined: true });
      } catch (err) {
        socket.emit('room:error', { message: err.message });
      }
    });

    // WebRTC signaling relay (offer/answer/ICE). Scoped to room members.
    socket.on('room:signal', async ({ roomId, to, data } = {}) => {
      try {
        if (!roomId) return;
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') return;
        const role = roomService.getRole(room, socket.userId);
        if (!role) return;
        await roomService.touchActivity(room);
        const payload = { roomId, from: socket.userId, to: to || null, data };
        if (to) {
          // Targeted: emit to room and let target filter (no per-user socket index needed)
          ns.to(`room:${roomId}`).emit('room:signal', payload);
        } else {
          socket.to(`room:${roomId}`).emit('room:signal', payload);
        }
      } catch (err) {
        socket.emit('room:error', { message: err.message });
      }
    });

    // Host-owned sequenced terminal relay (Socket.IO fallback when WebRTC DC fails).
    socket.on('room:terminal-chunk', async ({ roomId, chunk } = {}) => {
      try {
        if (!roomId || typeof chunk !== 'string') return;
        if (Buffer.byteLength(chunk, 'utf8') > MAX_CHUNK_BYTES) {
          return socket.emit('room:error', { message: 'Chunk too large (max 64KB)' });
        }
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') return;
        const role = roomService.getRole(room, socket.userId);
        // Only host or controller may publish terminal output/input.
        if (role !== 'host' && role !== 'controller') {
          return socket.emit('room:error', { message: 'Read-only: control not granted' });
        }
        const entry = pushChunk(roomId, chunk);
        room.terminalSeq = entry.seq;
        await room.save();
        ns.to(`room:${roomId}`).emit('room:terminal-chunk', {
          roomId,
          seq: entry.seq,
          chunk: entry.chunk,
        });
      } catch (err) {
        socket.emit('room:error', { message: err.message });
      }
    });

    socket.on('room:terminal-resync', async ({ roomId, fromSeq } = {}) => {
      try {
        if (!roomId) return;
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') return;
        const role = roomService.getRole(room, socket.userId);
        if (!role) return;
        const { seq, chunks } = chunksFrom(roomId, fromSeq || 0);
        socket.emit('room:terminal-resync', { roomId, seq, chunks });
      } catch (err) {
        socket.emit('room:error', { message: err.message });
      }
    });

    socket.on('room:control-request', async ({ roomId } = {}) => {
      try {
        if (!roomId) return;
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') return;
        const role = roomService.getRole(room, socket.userId);
        if (!role) return;
        // Notify host for consent.
        ns.to(`room:${roomId}`).emit('room:control-request', {
          roomId,
          userId: socket.userId,
          user: socket.user,
        });
      } catch (err) {
        socket.emit('room:error', { message: err.message });
      }
    });

    socket.on('room:leave', ({ roomId } = {}) => {
      if (roomId) {
        socket.leave(`room:${roomId}`);
        // Only announce the departure for rooms this socket actually joined —
        // otherwise any authenticated socket could inject presence events
        // ("user left") into arbitrary rooms.
        if (joinedRooms.has(roomId)) {
          joinedRooms.delete(roomId);
          socket.to(`room:${roomId}`).emit('room:presence', { userId: socket.userId, joined: false });
        }
      }
    });
  });

  async function broadcastClosed(roomId) {
    ns.to(`room:${roomId}`).emit('room:closed', { roomId });
    clearBuffer(roomId);
  }

  console.log('✓ Debug rooms (/rooms) namespace initialized');
  return { ns, broadcastClosed, _buffers: terminalBuffers, pushChunk, chunksFrom, clearBuffer };
};
