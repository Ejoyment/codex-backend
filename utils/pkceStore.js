// TTL-bounded store for Figma PKCE code verifiers (audit finding: unpruned
// caches; DES-01: in-process-only state).
//
// Verifiers are written to Redis when REDIS_URL is configured, so the OAuth
// callback can land on any instance and a deploy mid-flow does not strand the
// verifier. Redis holds them with a PX expiry and consumes them atomically on
// read (Lua GET+DEL), so a verifier is still one-time use across nodes.
//
// Without Redis (dev, tests, a Redis outage) the same interface is served by an
// in-memory Map: entries carry an expiry (default 10 minutes, matching the OAuth
// round trip), a sweep timer prunes them, and a hard cap evicts oldest-first if
// a flood outpaces the sweep. The memory copy is written even when Redis is in
// use, but reads prefer Redis: if Redis is healthy and has no entry, another
// node already consumed it and this instance must not replay it.

const { getRedisClients } = require('./redis');

const PKCE_TTL_MS = parseInt(process.env.FIGMA_PKCE_TTL_MS, 10) || 10 * 60 * 1000;
const PKCE_MAX_ENTRIES = parseInt(process.env.FIGMA_PKCE_MAX_ENTRIES, 10) || 5000;
const PKCE_SWEEP_MS = parseInt(process.env.FIGMA_PKCE_SWEEP_MS, 10) || 60 * 1000;
const KEY_PREFIX = 'figma:pkce:';

// Atomic read-and-delete so the verifier cannot be redeemed twice.
const GET_DEL_LUA = "local v = redis.call('GET', KEYS[1]) if v then redis.call('DEL', KEYS[1]) end return v";

const store = new Map(); // userId -> { verifier, expiresAt }

function readMemory(key, now = Date.now()) {
    const entry = store.get(key);
    if (!entry) return null;
    if (!entry.expiresAt || entry.expiresAt <= now) {
        store.delete(key);
        return null;
    }
    return entry.verifier;
}

function writeMemory(key, verifier) {
    if (!store.has(key) && store.size >= PKCE_MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { verifier, expiresAt: Date.now() + PKCE_TTL_MS });
}

async function set(userId, verifier) {
    const key = String(userId);
    writeMemory(key, verifier);
    const redis = await getRedisClients();
    if (!redis) return;
    try {
        await redis.pub.set(KEY_PREFIX + key, verifier, 'PX', PKCE_TTL_MS);
    } catch (error) {
        console.warn('PKCE verifier write to Redis failed, using memory:', error.message);
    }
}

async function get(userId) {
    const key = String(userId);
    const redis = await getRedisClients();
    if (redis) {
        try {
            const value = await redis.pub.eval(GET_DEL_LUA, 1, KEY_PREFIX + key);
            store.delete(key);
            return value || null;
        } catch (error) {
            console.warn('PKCE verifier read from Redis failed, using memory:', error.message);
        }
    }
    return readMemory(key);
}

async function del(userId) {
    const key = String(userId);
    store.delete(key);
    const redis = await getRedisClients();
    if (!redis) return;
    try {
        await redis.pub.del(KEY_PREFIX + key);
    } catch (error) {
        console.warn('PKCE verifier delete from Redis failed:', error.message);
    }
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
