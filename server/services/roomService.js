/**
 * Phase 3 — roomService
 * Create/close ephemeral debug rooms, build redacted state snapshots,
 * enforce TTL + idle-timeout cleanup.
 *
 * Security rules:
 * - Guests are read-only by default (viewer).
 * - Controller rights must be explicitly granted by the host, instantly revocable.
 * - No secret value leaves the host unless explicitly shared one variable at a time.
 */

const crypto = require('crypto');
const DebugRoom = require('../models/DebugRoomModel');

const ROOM_TTL_MS = parseInt(process.env.DEBUG_ROOM_TTL_MS || '', 10) || 2 * 60 * 60 * 1000; // 2h
const IDLE_TIMEOUT_MS = parseInt(process.env.DEBUG_ROOM_IDLE_MS || '', 10) || 30 * 60 * 1000; // 30m

// Env keys that are never auto-shared; redaction matches *_KEY, *_SECRET, *_TOKEN, *_PASSWORD.
const SECRET_NAME_RE = /(_KEY|_SECRET|_TOKEN|_PASSWORD)$/i;
// Small allowlist of safe-to-share keys (values still require explicit per-variable share).
const ENV_ALLOWLIST = new Set([
  'NODE_ENV',
  'PORT',
  'LANG',
  'LC_ALL',
  'TZ',
  'TERM',
  'PATH',
  'SHELL',
]);

function redactEnvValue(name, value) {
  if (SECRET_NAME_RE.test(name)) return '[REDACTED]';
  return value;
}

/**
 * Filter host env through allowlist + redaction.
 * Returns only explicitly shared keys (sharedKeys), each individually approved.
 */
function filterEnv(env = {}, sharedKeys = []) {
  const out = {};
  for (const key of sharedKeys) {
    if (!ENV_ALLOWLIST.has(key) && SECRET_NAME_RE.test(key)) {
      // Secret keys are blocked even if requested — host must rotate/share out-of-band.
      out[key] = '[REDACTED]';
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      out[key] = redactEnvValue(key, env[key]);
    }
  }
  return out;
}

/**
 * Build a state snapshot of the host workspace.
 * - terminalBuffer: serialized terminal buffer (xterm serialize addon output passed in by host)
 * - stackTrace: last parsed stack trace (host-provided, capped)
 * - openFiles: [{ path, cursor }] — contents sync via Yjs, not here
 * - git: { branch, diff } — diff capped to avoid snapshot bloat
 * - env: allowlisted + redacted, only explicitly shared keys
 */
function buildSnapshot({
  terminalBuffer = '',
  stackTrace = null,
  openFiles = [],
  gitBranch = null,
  gitDiff = '',
  env = {},
  sharedEnvKeys = [],
} = {}) {
  const MAX_TERMINAL = 20000;
  const MAX_DIFF = 20000;
  const MAX_STACK = 50;

  let stack = null;
  if (stackTrace) {
    if (Array.isArray(stackTrace)) {
      stack = stackTrace.slice(0, MAX_STACK);
    } else if (typeof stackTrace === 'string') {
      stack = stackTrace.split('\n').slice(0, MAX_STACK).join('\n');
    } else {
      stack = stackTrace;
    }
  }

  const files = (Array.isArray(openFiles) ? openFiles : [])
    .slice(0, 50)
    .map((f) => ({
      path: String(f.path || f.filePath || '').slice(0, 500),
      cursor: f.cursor || null,
    }))
    .filter((f) => f.path);

  return {
    snapshotId: `snap_${crypto.randomBytes(8).toString('hex')}`,
    takenAt: new Date().toISOString(),
    terminalBuffer: String(terminalBuffer || '').slice(-MAX_TERMINAL),
    stackTrace: stack,
    openFiles: files,
    git: {
      branch: gitBranch ? String(gitBranch).slice(0, 200) : null,
      diff: String(gitDiff || '').slice(0, MAX_DIFF),
    },
    env: filterEnv(env, sharedEnvKeys),
    sharedEnvKeys: [...sharedEnvKeys],
  };
}

async function createRoom({ hostId, workspaceId = null, taskRef = null, ttlMs = ROOM_TTL_MS }) {
  const now = new Date();
  const room = await DebugRoom.create({
    hostId,
    workspaceId,
    taskRef,
    participants: [{ userId: hostId, role: 'host', joinedAt: now }],
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(Date.now() + ttlMs),
    lastActivityAt: now,
  });
  return room;
}

async function getRoom(id) {
  return DebugRoom.findById(id);
}

async function touchActivity(room) {
  room.lastActivityAt = new Date();
  await room.save();
  return room;
}

async function activateRoom(room) {
  if (room.status === 'pending') {
    room.status = 'active';
    await touchActivity(room);
  }
  return room;
}

function isHost(room, userId) {
  return room.hostId?.toString() === userId?.toString();
}

function getRole(room, userId) {
  const p = room.participants.find((x) => x.userId?.toString() === userId?.toString());
  return p ? p.role : null;
}

async function requestJoin(room, userId) {
  const already = room.participants.some((p) => p.userId?.toString() === userId?.toString());
  if (already) return room;
  const pending = room.pendingRequests.some((r) => r.userId?.toString() === userId?.toString());
  if (!pending) {
    room.pendingRequests.push({ userId, requestedAt: new Date() });
    await touchActivity(room);
  }
  return room;
}

async function respondToJoin(room, targetUserId, approve) {
  room.pendingRequests = room.pendingRequests.filter(
    (r) => r.userId?.toString() !== targetUserId?.toString()
  );
  if (approve) {
    const exists = room.participants.some(
      (p) => p.userId?.toString() === targetUserId?.toString()
    );
    if (!exists) {
      // Read-only by default — viewer until host grants control.
      room.participants.push({ userId: targetUserId, role: 'viewer', joinedAt: new Date() });
    }
    await activateRoom(room);
  } else {
    await touchActivity(room);
  }
  return room;
}

async function setControl(room, targetUserId, grant) {
  const p = room.participants.find((x) => x.userId?.toString() === targetUserId?.toString());
  if (!p) throw new Error('Participant not found');
  if (p.role === 'host') throw new Error('Cannot change host role');
  p.role = grant ? 'controller' : 'viewer';
  await touchActivity(room);
  return room;
}

async function removeParticipant(room, targetUserId) {
  room.participants = room.participants.filter(
    (p) => p.userId?.toString() !== targetUserId?.toString()
  );
  await touchActivity(room);
  return room;
}

/**
 * Close a room and wipe all snapshot data. After this, nothing persists —
 * the document is deleted so TTL/expiry leaves no trace.
 */
async function closeRoom(room) {
  const id = room._id;
  room.status = 'closed';
  room.snapshotRef = null;
  room.sharedEnvKeys = [];
  room.pendingRequests = [];
  room.participants = [];
  // Hard delete so no snapshot data persists.
  await DebugRoom.deleteOne({ _id: id });
  return { closed: true, id };
}

/**
 * Sweep expired + idle rooms. Returns counts for observability.
 */
async function cleanupExpiredRooms({ now = new Date() } = {}) {
  const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
  const res = await DebugRoom.deleteMany({
    $or: [{ expiresAt: { $lte: now } }, { lastActivityAt: { $lte: idleCutoff } }],
  });
  return { deleted: res.deletedCount || 0 };
}

let _sweeper = null;
function startSweeper(intervalMs = 5 * 60 * 1000) {
  if (_sweeper) return _sweeper;
  _sweeper = setInterval(() => {
    cleanupExpiredRooms().catch((e) => console.error('room sweeper error:', e.message));
  }, intervalMs);
  if (_sweeper.unref) _sweeper.unref();
  return _sweeper;
}
function stopSweeper() {
  if (_sweeper) clearInterval(_sweeper);
  _sweeper = null;
}

module.exports = {
  ROOM_TTL_MS,
  IDLE_TIMEOUT_MS,
  SECRET_NAME_RE,
  ENV_ALLOWLIST,
  filterEnv,
  redactEnvValue,
  buildSnapshot,
  createRoom,
  getRoom,
  touchActivity,
  activateRoom,
  isHost,
  getRole,
  requestJoin,
  respondToJoin,
  setControl,
  removeParticipant,
  closeRoom,
  cleanupExpiredRooms,
  startSweeper,
  stopSweeper,
};
