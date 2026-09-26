/**
 * Phase 3 — roomSyncService (server side).
 * Maps debug rooms to their shared Yjs documents. File contents, cursors and
 * awareness/presence flow through the existing collaborationService Yjs docs;
 * this registry scopes them per-room so presence lists room participants.
 */
const collaborationService = require('../../utils/collaborationService');

// roomId -> Set<fileId>
const roomFiles = new Map();

function shareFile(roomId, fileId, initialContent = '') {
  collaborationService.getDocument(fileId, initialContent);
  if (!roomFiles.has(roomId)) roomFiles.set(roomId, new Set());
  roomFiles.get(roomId).add(fileId);
  return collaborationService.getDocument(fileId);
}

function unshareFile(roomId, fileId) {
  const set = roomFiles.get(roomId);
  if (set) set.delete(fileId);
}

function roomFileIds(roomId) {
  return [...(roomFiles.get(roomId) || [])];
}

function roomPresence(roomId) {
  const out = {};
  for (const fileId of roomFileIds(roomId)) {
    out[fileId] = collaborationService.getActiveUsers(fileId);
  }
  return out;
}

function clearRoom(roomId) {
  roomFiles.delete(roomId);
}

module.exports = { shareFile, unshareFile, roomFileIds, roomPresence, clearRoom };
