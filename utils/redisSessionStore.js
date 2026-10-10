/**
 * Redis-backed express-session store with MemoryStore fallback (rec 3.7).
 *
 * Without REDIS_URL this is a plain MemoryStore (current single-instance
 * behavior, unchanged). With REDIS_URL, session reads/writes go to Redis and
 * any Redis failure fails OPEN to memory after tripping a 30s
 * circuit-breaker — a dead cache must never log every user out.
 */
const session = require('express-session');

const BREAKER_MS = 30000;

// express-session is wholesale-mocked in some suites (bare function, no
// Store/MemoryStore) — resolve defensively so requiring this module never
// throws outside production wiring.
function sessionBase() {
    if (session && typeof session.Store === 'function') return session.Store;
    return null;
}

class FallbackMapStore {
    constructor() {
        this.sessions = new Map();
    }
    get(sid, cb = () => {}) {
        try {
            cb(null, this.sessions.get(sid) || null);
        } catch (err) {
            cb(err);
        }
    }
    set(sid, sess, cb = () => {}) {
        try {
            this.sessions.set(sid, sess);
            cb(null);
        } catch (err) {
            cb(err);
        }
    }
    destroy(sid, cb = () => {}) {
        try {
            this.sessions.delete(sid);
            cb(null);
        } catch (err) {
            cb(err);
        }
    }
    touch(sid, sess, cb = () => {}) {
        try {
            if (this.sessions.has(sid)) this.sessions.set(sid, sess);
            cb(null);
        } catch (err) {
            cb(err);
        }
    }
}

const BaseStore = sessionBase() || FallbackMapStore;

class ResilientSessionStore extends BaseStore {
    constructor(primary, fallback) {
        super();
        this.primary = primary;
        this.fallback = fallback;
        this.breakerUntil = 0;
    }

    async _run(op, ...args) {
        if (Date.now() < this.breakerUntil || !this.primary) {
            return this.fallback[op](...args);
        }
        try {
            return await this.primary[op](...args);
        } catch (error) {
            this.breakerUntil = Date.now() + BREAKER_MS;
            console.warn(`Session Redis failed (${op}), falling back to memory:`, error.message);
            return this.fallback[op](...args);
        }
    }

    get(sid, cb = () => {}) {
        this._run('get', sid).then(
            (sess) => cb(null, sess),
            (err) => cb(err)
        );
    }

    set(sid, sess, cb = () => {}) {
        this._run('set', sid, sess).then(
            () => cb(null),
            (err) => cb(err)
        );
    }

    destroy(sid, cb = () => {}) {
        this._run('destroy', sid).then(
            () => cb(null),
            (err) => cb(err)
        );
    }

    touch(sid, sess, cb = () => {}) {
        this._run('touch', sid, sess).then(
            () => cb(null),
            (err) => cb(err)
        );
    }
}

function makeMemoryStore() {
    if (session && typeof session.MemoryStore === 'function') {
        return new session.MemoryStore();
    }
    return new FallbackMapStore();
}

function createSessionStore() {
    const fallback = makeMemoryStore();
    if (!process.env.REDIS_URL) return fallback;
    try {
        const RedisStore = require('connect-redis').default;
        const Redis = require('ioredis');
        const client = new Redis(process.env.REDIS_URL, {
            lazyConnect: false,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
        });
        client.on('error', () => {});
        const primary = new RedisStore({ client, prefix: 'sess:' });
        return new ResilientSessionStore(primary, fallback);
    } catch (error) {
        console.warn('Redis session store unavailable, using memory:', error.message);
        return fallback;
    }
}

module.exports = { ResilientSessionStore, createSessionStore };
