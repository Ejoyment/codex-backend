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
const gitService = require('./gitService');
const { redactEnvVars } = require('./sanitize');

const PENDING_TTL_MS = Number(process.env.DEBUG_ROOM_PENDING_TTL_MS || 60 * 1000);
const ACTIVE_TTL_MS = Number(process.env.DEBUG_ROOM_ACTIVE_TTL_MS || 2 * 60 * 60 * 1000);

class DebugRoomServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
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
    expiresAt: new Date(Date.now() + PENDING_TTL_MS)
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
    return room;
  }

  if (decision !== 'approve') {
    throw new DebugRoomServiceError("decision must be 'approve' or 'deny'");
  }

  room.status = 'active';
  room.participants.push({ user: hostId, role: 'host', joinedAt: new Date() });
  room.expiresAt = new Date(Date.now() + ACTIVE_TTL_MS);
  await room.save();
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
  await room.save();
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
  return room;
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
async function buildSnapshot({ workspaceId, env = {}, explicitShareKeys = [] }) {
  const snapshot = {
    builtAt: new Date().toISOString(),
    git: null,
    env: redactEnvVars(env, explicitShareKeys)
  };

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
  buildSnapshot
};