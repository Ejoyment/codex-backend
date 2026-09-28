// Survives navigation away from the editor: open tabs, buffer contents,
// dirty state and the selected repo/project are persisted to localStorage so
// returning to the editor restores your work exactly as you left it.
//
// Session shape:
// {
//   contents: { [fileKey]: { c, o, n, p, s, g? } },  // open tab buffers
//   parked:   { [fileKey]: { c, o, n, p, s, g? } },   // saved-but-closed GitHub edits
//   openFiles: [{ _id, name, path, source, language, sha }],
//   selectedKey, repo, projectId, updatedAt
// }
//   c = buffer content, o = last locally saved content (dirty = c !== o),
//   n/p = name/path, s = 'gh' | 'db', g = last-known GitHub remote content.

const KEY = 'buildrs-editor-session-v1';
const MAX_ENTRY_CHARS = 1_500_000;
const MAX_TOTAL_CHARS = 5_000_000;

function prune(contents) {
  // Drop oversized entries, then oldest until under the total budget.
  const entries = Object.entries(contents || {});
  const kept = {};
  for (const [k, e] of entries) {
    if (typeof e?.c !== 'string' || e.c.length > MAX_ENTRY_CHARS) continue;
    kept[k] = e;
  }
  let total = Object.values(kept).reduce((n, e) => n + e.c.length, 0);
  if (total > MAX_TOTAL_CHARS) {
    const byAge = Object.entries(kept).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
    for (const [k, e] of byAge) {
      if (total <= MAX_TOTAL_CHARS) break;
      total -= e.c.length;
      delete kept[k];
    }
  }
  return kept;
}

export function loadSession() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session !== 'object') return null;
    session.contents = prune(session.contents);
    session.parked = prune(session.parked);
    return session;
  } catch (_) {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (typeof window === 'undefined') return;
    if (!session) {
      window.localStorage.removeItem(KEY);
      return;
    }
    session.contents = prune(session.contents);
    session.parked = prune(session.parked);
    session.updatedAt = Date.now();
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch (_) {
    // Quota/privacy mode — losing the local mirror is non-fatal; the server
    // copy of saved files still exists.
    try {
      window.localStorage.removeItem(KEY);
    } catch (__) { /* ignore */ }
  }
}

export default { loadSession, saveSession };
