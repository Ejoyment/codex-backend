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

const { resolveSocketUser } = require('../../utils/socketAuth');
const roomService = require('../services/roomService');

// Per-chunk cap: the ring buffer caps chunk COUNT (500), so without a byte
// cap one client could park ~500MB in memory with 1MB chunks.
const MAX_CHUNK_BYTES = 64 * 1024;

// Terminal ring buffers. Redis holds the list when configured (DES-03) so a
// reconnecting client lands on any instance; the Map below is the fallback.
// roomId -> { seq, chunks: [{ seq, chunk, ts }] }
const terminalBuffers = new Map();
const TERMINAL_BUFFER_CAP = 500;
const TERMINAL_BUFFER_TTL_MS = 30 * 60 * 1000;
const MAX_TERMINAL_BUFFERS = 200;
const TERM_KEY_PREFIX = 'room:term:';
const TERM_SEQ_PREFIX = 'room:termseq:';

async function redisClients() {
  try {
    return await require('../../utils/redis').getRedisClients();
  } catch {
    return null;
  }
}

function pruneBuffers(now = Date.now()) {
  for (const [roomId, buffer] of terminalBuffers) {
    if (now - (buffer.touchedAt || 0) > TERMINAL_BUFFER_TTL_MS) {
      terminalBuffers.delete(roomId);
    }
  }
}

function getBuffer(roomId) {
  const now = Date.now();
  pruneBuffers(now);
  let b = terminalBuffers.get(roomId);
  if (!b) {
    if (terminalBuffers.size >= MAX_TERMINAL_BUFFERS) {
      const oldest = terminalBuffers.keys().next().value;
      if (oldest !== undefined) terminalBuffers.delete(oldest);
    }
    b = { seq: 0, chunks: [], touchedAt: now };
    terminalBuffers.set(roomId, b);
  }
  b.touchedAt = now;
  return b;
}

async function pushChunk(roomId, chunk) {
  const text = String(chunk);
  const redis = await redisClients();
  if (redis) {
    try {
      const key = `${TERM_KEY_PREFIX}${roomId}`;
      const seqKey = `${TERM_SEQ_PREFIX}${roomId}`;
      const seq = Number(await redis.pub.incr(seqKey));
      const entry = { seq, chunk: text, ts: Date.now() };
      await redis.pub.multi()
        .rpush(key, JSON.stringify(entry))
        .ltrim(key, -TERMINAL_BUFFER_CAP, -1)
        .pexpire(key, TERMINAL_BUFFER_TTL_MS)
        .pexpire(seqKey, TERMINAL_BUFFER_TTL_MS)
        .exec();
      return entry;
    } catch {
      // Fall back to the local ring so output keeps flowing.
    }
  }

  const b = getBuffer(roomId);
  b.seq += 1;
  const entry = { seq: b.seq, chunk: text, ts: Date.now() };
  b.chunks.push(entry);
  if (b.chunks.length > TERMINAL_BUFFER_CAP) b.chunks.splice(0, b.chunks.length - TERMINAL_BUFFER_CAP);
  return entry;
}

async function chunksFrom(roomId, fromSeq) {
  const redis = await redisClients();
  if (redis) {
    try {
      const rows = await redis.pub.lrange(`${TERM_KEY_PREFIX}${roomId}`, 0, -1);
      if (rows.length) {
        const parsed = rows.map((row) => { try { return JSON.parse(row); } catch { return null; } }).filter(Boolean);
        if (parsed.length) {
          const last = parsed[parsed.length - 1];
          return { seq: last.seq, chunks: parsed.filter((c) => c.seq > (fromSeq || 0)) };
        }
      }
      // The list expired but the counter may still be alive; report the seq
      // without inventing chunks.
      const seq = Number(await redis.pub.get(`${TERM_SEQ_PREFIX}${roomId}`)) || 0;
      if (seq) return { seq, chunks: [] };
    } catch {
      // Fall back to the local ring.
    }
  }

  const b = terminalBuffers.get(roomId);
  if (!b) return { seq: 0, chunks: [] };
  return { seq: b.seq, chunks: b.chunks.filter((c) => c.seq > (fromSeq || 0)) };
}

async function clearBuffer(roomId) {
  terminalBuffers.delete(roomId);
  const redis = await redisClients();
  if (!redis) return;
  try {
    await redis.pub.del(`${TERM_KEY_PREFIX}${roomId}`, `${TERM_SEQ_PREFIX}${roomId}`);
  } catch { /* best effort */ }
}

module.exports = (io) => {
  const ns = io.of('/rooms');

    ns.use(async (socket, next) => {
      try {
        const { userId, decoded } = await resolveSocketUser(socket);
        socket.userId = userId;
        socket.user = { ...decoded, id: userId };
        next();
      } catch (e) {
        next(e);
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
        const { seq } = await chunksFrom(roomId, 0);
        socket.emit('room:joined', { roomId, role, terminalSeq: seq });
        socket.to(`room:${roomId}`).emit('room:presence', { userId: socket.userId, role, joined: true });
      } catch (err) {
        console.error('[rooms] socket operation failed:', err.message);
        socket.emit('room:error', { message: 'Room operation failed. Please retry.' });
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
        console.error('[rooms] socket operation failed:', err.message);
        socket.emit('room:error', { message: 'Room operation failed. Please retry.' });
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
        const entry = await pushChunk(roomId, chunk);
        room.terminalSeq = entry.seq;
        await room.save();
        ns.to(`room:${roomId}`).emit('room:terminal-chunk', {
          roomId,
          seq: entry.seq,
          chunk: entry.chunk,
        });
      } catch (err) {
        console.error('[rooms] socket operation failed:', err.message);
        socket.emit('room:error', { message: 'Room operation failed. Please retry.' });
      }
    });

    socket.on('room:terminal-resync', async ({ roomId, fromSeq } = {}) => {
      try {
        if (!roomId) return;
        const room = await roomService.getRoom(roomId);
        if (!room || room.status === 'closed') return;
        const role = roomService.getRole(room, socket.userId);
        if (!role) return;
        const { seq, chunks } = await chunksFrom(roomId, fromSeq || 0);
        socket.emit('room:terminal-resync', { roomId, seq, chunks });
      } catch (err) {
        console.error('[rooms] socket operation failed:', err.message);
        socket.emit('room:error', { message: 'Room operation failed. Please retry.' });
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
        console.error('[rooms] socket operation failed:', err.message);
        socket.emit('room:error', { message: 'Room operation failed. Please retry.' });
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
    await clearBuffer(roomId);
  }

  console.log('✓ Debug rooms (/rooms) namespace initialized');
  return { ns, broadcastClosed, _buffers: terminalBuffers, pushChunk, chunksFrom, clearBuffer };
};
