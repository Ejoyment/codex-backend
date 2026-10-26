/**
 * Shared Redis wiring (rec 3.7) — sessions, socket adapter, rate-limit
 * store, cron leadership.
 *
 * Everything here is optional: without REDIS_URL every helper falls back to
 * single-instance behavior (MemoryStore, default adapter, direct execution).
 * With REDIS_URL set, helpers connect lazily once and reuse the clients; a
 * dead Redis degrades loudly at boot (fail-fast) but request paths that can
 * fail open do (rate limits via passOnStoreError).
 */
const crypto = require('crypto');

let clients = null; // { pub, sub } once connected
let authRevokeSubscriber = null;
let negativeUntil = 0;
const NEGATIVE_TTL_MS = 30000;
const AUTH_REVOKE_CHANNEL = 'auth:revoke';

function isRedisConfigured() {
    return Boolean(process.env.REDIS_URL);
}

// Connected { pub, sub } pair, or null (unconfigured or unreachable).
// Negative-cached briefly so a dead Redis doesn't stall every caller.
async function getRedisClients() {
    if (!isRedisConfigured()) return null;
    if (clients) return clients;
    if (Date.now() < negativeUntil) return null;
    try {
        const Redis = require('ioredis');
        const pub = new Redis(process.env.REDIS_URL, {
            lazyConnect: true,
            enableReadyCheck: true,
            maxRetriesPerRequest: 2,
        });
        pub.on('error', () => {});
        await pub.connect();
        const sub = pub.duplicate();
        sub.on('error', () => {});
        await sub.connect();
        clients = { pub, sub };
        return clients;
    } catch (error) {
        negativeUntil = Date.now() + NEGATIVE_TTL_MS;
        console.warn('Redis unavailable, using single-instance fallbacks:', error.message);
        return null;
    }
}

// Test helper: drop cached clients/negative state.
function resetRedisCache() {
    clients = null;
    negativeUntil = 0;
    if (authRevokeSubscriber) {
        try { authRevokeSubscriber.disconnect(); } catch {}
        authRevokeSubscriber = null;
    }
    if (rateLimitClient) {
        try { rateLimitClient.disconnect(); } catch {}
        rateLimitClient = null;
    }
}

async function closeRedis() {
    const current = clients;
    clients = null;
    if (rateLimitClient) {
        try { await rateLimitClient.quit(); } catch {}
        rateLimitClient = null;
    }
    if (authRevokeSubscriber) {
        try { await authRevokeSubscriber.disconnect(); } catch {}
        authRevokeSubscriber = null;
    }
    if (current) {
        try { await current.sub.disconnect(); } catch {}
        try { await current.pub.disconnect(); } catch {}
    }
}

// Cross-instance auth revocation. The subscriber is a dedicated duplicate so
// it never steals messages from the Socket.IO adapter's pub/sub pair.
async function publishAuthRevoke(userId) {
    const redis = await getRedisClients();
    if (!redis) return false;
    try {
        await redis.pub.publish(AUTH_REVOKE_CHANNEL, JSON.stringify({ userId: String(userId) }));
        return true;
    } catch (error) {
        console.warn('Auth revocation publish failed:', error.message);
        return false;
    }
}

async function subscribeAuthRevoke(handler) {
    if (typeof handler !== 'function') return false;
    const redis = await getRedisClients();
    if (!redis) return false;
    if (authRevokeSubscriber) return true;
    try {
        const sub = redis.pub.duplicate();
        sub.on('error', () => {});
        await sub.connect();
        await sub.subscribe(AUTH_REVOKE_CHANNEL);
        sub.on('message', (channel, message) => {
            if (channel !== AUTH_REVOKE_CHANNEL) return;
            try {
                const payload = JSON.parse(message);
                if (payload && payload.userId) handler(String(payload.userId));
            } catch {}
        });
        authRevokeSubscriber = sub;
        return true;
    } catch (error) {
        console.warn('Auth revocation subscriber unavailable:', error.message);
        return false;
    }
}

// Cron leadership: only one instance runs the wrapped fn per ttl window.
// Without Redis this instance IS the leader (single-instance behavior).
// Returns { leader: false, skipped: true } for losers.
async function withLeadership(name, ttlMs, fn) {
    const redis = await getRedisClients();
    if (!redis) return fn();
    const key = `leader:${name}`;
    const token = crypto.randomBytes(8).toString('hex');
    let acquired = null;
    try {
        acquired = await redis.pub.set(key, token, 'PX', ttlMs, 'NX');
    } catch {
        return fn(); // fail open: a Redis blip must not stop billing cron
    }
    if (acquired !== 'OK') return { skipped: true, leader: false };
    try {
        return await fn();
    } finally {
        try {
            await redis.pub.eval(
                "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
                1, key, token
            );
        } catch {}
    }
}

// express-rate-limit store: Redis when configured, undefined (= in-process
// MemoryStore) otherwise. Each limiter needs its OWN store instance (sharing
// one is an express-rate-limit validation error), so this returns a fresh
// store per call. The name becomes a stable Redis key prefix so every instance
// of the same limiter shares counters across deploys.
let rateLimitClient = null;
function getRateLimitStore(name = 'default') {
    if (!process.env.REDIS_URL) return undefined;
    try {
        if (!rateLimitClient) {
            const Redis = require('ioredis');
            rateLimitClient = new Redis(process.env.REDIS_URL, {
                enableOfflineQueue: false,
                maxRetriesPerRequest: 2,
            });
            rateLimitClient.on('error', () => {});
        }
        const RedisStore = require('rate-limit-redis');
        const store = new RedisStore({
            sendCommand: (...args) => rateLimitClient.call(...args),
            prefix: `rl:${String(name).replace(/[^a-zA-Z0-9:_-]/g, '-')}:`,
        });
        // Construction kicks off a Lua upload that may reject while Redis is
        // unreachable; the store reloads it on first use, so just prevent an
        // unhandled rejection from crashing boot.
        store.loadedScriptSha1.catch(() => {});
        return store;
    } catch (error) {
        console.warn('Redis rate-limit store unavailable, using memory:', error.message);
        return undefined;
    }
}

module.exports = {
    isRedisConfigured,
    getRedisClients,
    resetRedisCache,
    closeRedis,
    withLeadership,
    getRateLimitStore,
    publishAuthRevoke,
    subscribeAuthRevoke,
};
