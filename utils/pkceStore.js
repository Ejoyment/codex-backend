// TTL-bounded in-memory store for Figma PKCE code verifiers (audit finding:
// unpruned caches).
//
// The store was previously a plain Map whose entries were removed only when the
// OAuth callback arrived, so every abandoned flow (user opens /connect, then
// closes the tab) left its verifier in memory forever. Entries now carry an
// expiry (default 10 minutes, matching the OAuth round trip), a sweep timer
// prunes them, and a hard cap evicts oldest-first if a flood outpaces the sweep.
//
// Single-instance only: with multiple server instances the callback can land on
// a different instance than /connect. Move this to Redis for horizontal scale.

const PKCE_TTL_MS = parseInt(process.env.FIGMA_PKCE_TTL_MS, 10) || 10 * 60 * 1000;
const PKCE_MAX_ENTRIES = parseInt(process.env.FIGMA_PKCE_MAX_ENTRIES, 10) || 5000;
const PKCE_SWEEP_MS = parseInt(process.env.FIGMA_PKCE_SWEEP_MS, 10) || 60 * 1000;

const store = new Map(); // userId -> { verifier, expiresAt }

function set(userId, verifier) {
    const key = String(userId);
    if (!store.has(key) && store.size >= PKCE_MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { verifier, expiresAt: Date.now() + PKCE_TTL_MS });
}

function get(userId) {
    const key = String(userId);
    const entry = store.get(key);
    if (!entry) return null;
    if (!entry.expiresAt || entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
    }
    return entry.verifier;
}

function del(userId) {
    store.delete(String(userId));
}

function prune(now = Date.now()) {
    for (const [key, entry] of store) {
        if (!entry || !entry.expiresAt || entry.expiresAt <= now) {
            store.delete(key);
        }
    }
    return store.size;
}

const sweepTimer = setInterval(() => prune(), PKCE_SWEEP_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = {
    set,
    get,
    delete: del,
    prune,
    size: () => store.size,
    clear: () => store.clear()
};
