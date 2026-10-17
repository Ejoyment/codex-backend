// Survives navigation away from the editor: open tabs, buffer contents,
// dirty state and the selected repo/project are persisted to localStorage so
// returning to the editor restores your work exactly as you left it.
//
// Secret-bearing files (dotenv files, private keys, credential stores) are
// deliberately kept OUT of the mirror: this store is plaintext localStorage,
// so those buffers live in memory only and reload from the server/GitHub on
// return.
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

// Plaintext localStorage must never hold credentials. Filenames are matched on
// their basename; a small over-inclusion (e.g. a directory literally named
// "secrets") is accepted — the cost is only that the file reloads from the
// server instead of restoring from the local mirror.
const SECRET_BASENAME = new RegExp(
  '^(?:' +
    '\\.env(?:\\..+)?|' +
    '\\.npmrc|\\.netrc|\\.git-credentials|\\.htpasswd|' +
    'id_rsa|id_dsa|id_ecdsa|id_ed25519|' +
    'credentials?(?:\\.(?:json|ya?ml|ini|txt|env|js|ts|mjs|cjs))?|' +
    'secrets?(?:\\.(?:json|ya?ml|ini|txt|env|js|ts|mjs|cjs))?|' +
    'service[-_]?account(?:[-_]\\w+)?\\.json' +
  ')$',
  'i'
);
const SECRET_EXT = /\.(?:pem|key|p12|pfx|jks|keystore)$/i;

function basename(value) {
  const parts = String(value || '').split(/[:/]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function isSecretPath(value) {
  const base = basename(value);
  return Boolean(base) && (SECRET_BASENAME.test(base) || SECRET_EXT.test(base));
}

function isSecretEntry(key, entry) {
  if (isSecretPath(key)) return true;
  if (!entry || typeof entry !== 'object') return false;
  // DB-backed files are keyed by ObjectId, so the name/path inside the entry
  // is the only place the real filename appears.
  return isSecretPath(entry.n) || isSecretPath(entry.p);
}

function prune(contents) {
  // Drop secret-file buffers outright, then oversized entries, then oldest
  // until under the total budget.
  const entries = Object.entries(contents || {});
  const kept = {};
  for (const [k, e] of entries) {
    if (isSecretEntry(k, e)) continue;
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
