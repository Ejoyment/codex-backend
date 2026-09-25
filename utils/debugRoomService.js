/**
 * Debug Room Service
 * Ephemeral, consent-based room lifecycle + snapshot building.
 *
 * Deliberately distinct from routes/debug.js + utils/debugAdapter.js, which
 * handle DAP-style breakpoint/stepping debug sessions. A "Debug Room" here
 * is Phase 3's one-click multiplayer session inheritance feature.
 *
 * Reuses existing infrastructure rather than duplicating it:
 * - File sync rides on CollaborationService's per-file Y.Docs (M3 is
 *   effectively already built there — joining a room just means joining
 *   the same `file:${fileId}` socket rooms the host is already in).
 * - Terminal mirroring rides on terminalService's existing PTY sessions
 *   (see the multi-listener patch in terminalService.js).
 * - Git state (branch/diff) is read via the existing gitService.
 */

const DebugRoom = require('../models/DebugRoom');
const TeamActivity = require('../models/TeamActivity');
const gitService = require('./gitService');
const { redactEnvVars } = require('./sanitize');

const PENDING_TTL_MS = Number(process.env.DEBUG_ROOM_PENDING_TTL_MS || 60 * 1000);
const ACTIVE_TTL_MS = Number(process.env.DEBUG_ROOM_ACTIVE_TTL_MS || 2 * 60 * 60 * 1000);
// Idle timeout: separate from the hard TTL above. A room can be well within
// its 2-hour TTL but abandoned — this closes it early. Per the Phase 3 plan:
// "Default room TTL (for example 2 hours) plus an idle timeout."
const IDLE_TIMEOUT_MS = Number(process.env.DEBUG_ROOM_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const IDLE_SWEEP_INTERVAL_MS = Number(process.env.DEBUG_ROOM_IDLE_SWEEP_INTERVAL_MS || 5 * 60 * 1000);

class DebugRoomServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Audit log write. Failures here are logged but never block the underlying
 * room action — losing an audit entry shouldn't break a debug session.
 */
async function logActivity({ companyId, userId, type, action, metadata = {} }) {
  try {
    await TeamActivity.create({ company: companyId, user: userId, type, action, metadata });
  } catch (error) {
    console.error(`Failed to write audit log (${type}):`, error.message);
  }
}

/**
 * Bump lastActivityAt so the idle sweep doesn't close a room mid-use.
 * Called on join and on control changes; deliberately NOT called per
 * terminal chunk or per keystroke — that would mean a DB write per byte.
 */
async function touchActivity(roomId) {
  await DebugRoom.updateOne({ _id: roomId }, { $set: { lastActivityAt: new Date() } });
}

/**
 * Guest taps a teammate's avatar. Creates a pending room; if the host never
 * responds, it self-expires via the TTL index on DebugRoom.
 */
async function createRoom({ hostId, guestId, companyId, projectId, taskRef, workspaceId, openFiles, terminalSessionId }) {
  if (!hostId || !guestId || !companyId) {
    throw new DebugRoomServiceError('hostId, guestId and companyId are required');
  }

  const room = await DebugRoom.create({
    host: hostId,
    company: companyId,
    project: projectId || undefined,
    taskRef: taskRef || undefined,
    workspaceId: workspaceId || undefined,
    openFiles: openFiles || [],
    terminalSessionId: terminalSessionId || null,
    status: 'pending',
    participants: [{ user: guestId, role: 'viewer', joinedAt: new Date() }],
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + PENDING_TTL_MS)
  });

  await logActivity({
    companyId,
    userId: guestId,
    type: 'debug_room_requested',
    action: `Requested a debug session with host ${hostId}`,
    metadata: { debugRoomId: room._id, targetUser: hostId }
  });

  return room;
}

/**
 * Host approves or denies the pending join request. Approving extends the
 * TTL to the full active-room lifetime and adds the host as a participant.
 */
async function respondToRoom({ roomId, hostId, decision }) {
  const room = await DebugRoom.findById(roomId);
  if (!room) throw new DebugRoomServiceError('Room not found', 404);
  if (String(room.host) !== String(hostId)) {
    throw new DebugRoomServiceError('Only the host can respond to this room', 403);
  }
  if (room.status !== 'pending') {
    throw new DebugRoomServiceError(`Room is already ${room.status}`, 409);
  }

  if (decision === 'deny') {
    room.status = 'closed';
    room.expiresAt = new Date();
    await room.save();
    await logActivity({
      companyId: room.company,
      userId: hostId,
      type: 'debug_room_denied',
      action: 'Denied a debug session request',
      metadata: { debugRoomId: room._id }
    });
    return room;
  }

  if (decision !== 'approve') {
    throw new DebugRoomServiceError("decision must be 'approve' or 'deny'");
  }

  room.status = 'active';
  room.participants.push({ user: hostId, role: 'host', joinedAt: new Date() });
  room.lastActivityAt = new Date();
  room.expiresAt = new Date(Date.now() + ACTIVE_TTL_MS);
  await room.save();

  await logActivity({
    companyId: room.company,
    userId: hostId,
    type: 'debug_room_approved',
    action: 'Approved a debug session request',
    metadata: { debugRoomId: room._id }
  });

  return room;
}

async function getRoom(roomId) {
  const room = await DebugRoom.findById(roomId);
  if (!room) throw new DebugRoomServiceError('Room not found', 404);
  return room;
}

/**
 * Grant, revoke, or request controller rights. Only the host may grant/revoke.
 */
async function updateControl({ roomId, actingUserId, targetUserId, action }) {
  const room = await DebugRoom.findById(roomId);
  if (!room) throw new DebugRoomServiceError('Room not found', 404);
  if (room.status !== 'active') {
    throw new DebugRoomServiceError('Room is not active', 409);
  }

  if (action === 'request') {
    const isParticipant = room.participants.some((p) => String(p.user) === String(actingUserId));
    if (!isParticipant) throw new DebugRoomServiceError('Not a participant in this room', 403);
    return room; // real-time delivery to the host happens over the socket layer
  }

  if (action !== 'grant' && action !== 'revoke') {
    throw new DebugRoomServiceError("action must be 'grant', 'revoke' or 'request'");
  }
  if (String(room.host) !== String(actingUserId)) {
    throw new DebugRoomServiceError('Only the host can grant or revoke control', 403);
  }

  const target = room.participants.find((p) => String(p.user) === String(targetUserId));
  if (!target) throw new DebugRoomServiceError('Target user is not a participant', 404);

  target.role = action === 'grant' ? 'controller' : 'viewer';
  room.lastActivityAt = new Date();
  await room.save();

  await logActivity({
    companyId: room.company,
    userId: actingUserId,
    type: action === 'grant' ? 'debug_room_control_granted' : 'debug_room_control_revoked',
    action: `${action === 'grant' ? 'Granted' : 'Revoked'} control to/from a participant`,
    metadata: { debugRoomId: room._id, targetUser: targetUserId }
  });

  return room;
}

/**
 * Close a room: wipe the snapshot pointer immediately (Ephemeral Guarantee),
 * mark closed. The TTL index removes the document itself shortly after.
 */
async function closeRoom({ roomId, actingUserId }) {
  const room = await DebugRoom.findById(roomId);
  if (!room) throw new DebugRoomServiceError('Room not found', 404);
  if (String(room.host) !== String(actingUserId)) {
    throw new DebugRoomServiceError('Only the host can close this room', 403);
  }

  room.status = 'closed';
  room.snapshotRef = null; // TODO: also delete the blob this pointed to, once snapshots move to encrypted blob storage
  room.expiresAt = new Date();
  await room.save();

  await logActivity({
    companyId: room.company,
    userId: actingUserId,
    type: 'debug_room_closed',
    action: 'Closed a debug session',
    metadata: { debugRoomId: room._id }
  });

  return room;
}

/**
 * Close a room on the system's behalf (idle timeout), rather than by host
 * action. Same effect as closeRoom, minus the host-only authorization check
 * that doesn't make sense for an automated sweep.
 */
async function closeRoomAsIdle(room) {
  room.status = 'closed';
  room.snapshotRef = null;
  room.expiresAt = new Date();
  await room.save();

  await logActivity({
    companyId: room.company,
    userId: room.host,
    type: 'debug_room_closed',
    action: 'Debug session closed automatically after being idle',
    metadata: { debugRoomId: room._id }
  });

  return room;
}

/**
 * Find and close 'active' rooms that have had no meaningful activity
 * (join, control change) for longer than IDLE_TIMEOUT_MS. Distinct from the
 * DebugRoom.expiresAt TTL index, which Mongo enforces on its own regardless
 * of activity — this catches rooms that are idle well before their hard TTL.
 */
async function sweepIdleRooms() {
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MS);
  const idleRooms = await DebugRoom.find({ status: 'active', lastActivityAt: { $lt: cutoff } });

  for (const room of idleRooms) {
    try {
      await closeRoomAsIdle(room);
    } catch (error) {
      console.error(`Failed to close idle debug room ${room._id}:`, error.message);
    }
  }

  return idleRooms.length;
}

let idleSweepInterval = null;

function startIdleSweep() {
  if (idleSweepInterval) return;
  idleSweepInterval = setInterval(() => {
    sweepIdleRooms().catch((error) => console.error('Idle sweep failed:', error.message));
  }, IDLE_SWEEP_INTERVAL_MS);
  if (idleSweepInterval.unref) idleSweepInterval.unref();
}

function stopIdleSweep() {
  if (idleSweepInterval) {
    clearInterval(idleSweepInterval);
    idleSweepInterval = null;
  }
}

if (process.env.NODE_ENV !== 'test') {
  startIdleSweep();
}

/**
 * Build the snapshot handed to the guest on approval: git state + redacted
 * env. Terminal scrollback and open-file contents are NOT included here —
 * those come live from terminalService's mirror buffer and
 * collaborationService's Y.Docs respectively, once the guest's sockets join.
 *
 * `env` is whatever the host's client sends up (we never read process.env
 * on the host's behalf); `explicitShareKeys` lists variables the host
 * explicitly chose to share in full, bypassing default redaction.
 */
async function buildSnapshot({ workspaceId, env = {}, explicitShareKeys = [], roomId, companyId, actingUserId }) {
  const snapshot = {
    builtAt: new Date().toISOString(),
    git: null,
    env: redactEnvVars(env, explicitShareKeys)
  };

  if (explicitShareKeys.length > 0 && roomId && companyId && actingUserId) {
    await logActivity({
      companyId,
      userId: actingUserId,
      type: 'debug_room_variable_shared',
      action: `Explicitly shared ${explicitShareKeys.length} environment variable(s) in full`,
      metadata: { debugRoomId: roomId, newValue: explicitShareKeys.join(', ') }
    });
  }

  if (workspaceId) {
    try {
      const [status, diff, branches] = await Promise.all([
        gitService.status(workspaceId),
        gitService.diff(workspaceId),
        gitService.branches(workspaceId)
      ]);
      snapshot.git = { status, diff, branches };
    } catch (error) {
      // Workspace may not be a git repo, or git isn't initialized yet —
      // that's fine, the snapshot just omits git state.
      snapshot.git = { error: error.message };
    }
  }

  return snapshot;
}

module.exports = {
  DebugRoomServiceError,
  createRoom,
  respondToRoom,
  getRoom,
  updateControl,
  closeRoom,
  buildSnapshot,
  touchActivity,
  sweepIdleRooms,
  startIdleSweep,
  stopIdleSweep
};