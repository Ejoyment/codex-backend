/**
 * Phase 3 — Live Sync Layer (browser side).
 * Yjs carries file contents + cursors + awareness/presence for room participants.
 * Terminal output is intentionally NOT here — it flows through the host-owned
 * sequenced stream (see terminalStream.js + room:terminal-chunk socket events).
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const docs = new Map(); // fileId -> { doc, provider }

export function getRoomDoc({ fileId, roomId, socketUrl, token }) {
  const key = `${roomId}:${fileId}`;
  if (docs.has(key)) return docs.get(key);
  const doc = new Y.Doc();
  const ytext = doc.getText('content');
  const ycursors = doc.getMap('cursors'); // userId -> { line, ch, selection }
  let provider = null;
  try {
    if (socketUrl) {
      provider = new WebsocketProvider(socketUrl, `room-${roomId}-${fileId}`, doc, {
        params: { token },
      });
    }
  } catch {
    provider = null; // offline-capable: local doc still works
  }
  const entry = { doc, ytext, ycursors, provider };
  docs.set(key, entry);
  return entry;
}

export function setCursor({ fileId, roomId, userId, cursor }) {
  const entry = docs.get(`${roomId}:${fileId}`);
  if (!entry) return;
  entry.ycursors.set(String(userId), { ...cursor, ts: Date.now() });
}

export function getCursors({ fileId, roomId }) {
  const entry = docs.get(`${roomId}:${fileId}`);
  if (!entry) return {};
  return Object.fromEntries(entry.ycursors.entries());
}

export function setPresenceAwareness({ fileId, roomId, userId, state }) {
  const entry = docs.get(`${roomId}:${fileId}`);
  if (!entry?.provider) return;
  try {
    entry.provider.awareness.setLocalStateField('user', { id: userId, ...state });
  } catch {
    // awareness unavailable — presence degrades silently, editing unaffected
  }
}

export function destroyRoomDoc({ fileId, roomId }) {
  const key = `${roomId}:${fileId}`;
  const entry = docs.get(key);
  if (entry) {
    try { entry.provider?.disconnect(); } catch {}
    try { entry.doc.destroy(); } catch {}
    docs.delete(key);
  }
}

export function destroyAllRoomDocs(roomId) {
  for (const key of [...docs.keys()]) {
    if (key.startsWith(`${roomId}:`)) {
      const entry = docs.get(key);
      try { entry.provider?.disconnect(); } catch {}
      try { entry.doc.destroy(); } catch {}
      docs.delete(key);
    }
  }
}
