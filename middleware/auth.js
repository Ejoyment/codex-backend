const jwt = require('jsonwebtoken');

// Cached liveness check so a deleted or deactivated account cannot keep using an
// already-issued token. JWTs are valid for 24h, so without this a user who
// deletes their account (or is banned) retains full access until it expires.
const LIVENESS_TTL_MS = parseInt(process.env.AUTH_LIVENESS_TTL_MS, 10) || 30000;
const livenessCache = new Map(); // userId -> { exists, tokenVersion, versionKnown, expiresAt }

// Entries used only to be pruned when the same user was looked up again, so
// every distinct account ever seen stayed in memory for the process lifetime.
// A periodic sweep plus a hard cap bound the cache (audit finding: unpruned caches).
const LIVENESS_MAX_ENTRIES = parseInt(process.env.AUTH_LIVENESS_MAX_ENTRIES, 10) || 50000;
const LIVENESS_SWEEP_MS = parseInt(process.env.AUTH_LIVENESS_SWEEP_MS, 10) || 60000;

function normalizeTokenVersion(value) {
    const version = Number(value);
    if (!Number.isFinite(version) || version <= 0) return 0;
    return Math.floor(version);
}

function isTokenVersionCurrent(payloadVersion, currentVersion) {
    return normalizeTokenVersion(payloadVersion) === normalizeTokenVersion(currentVersion);
}

function setLivenessEntry(userId, exists, ttlMs = LIVENESS_TTL_MS, tokenVersion = 0, versionKnown = false) {
    const key = String(userId);
    if (!livenessCache.has(key) && livenessCache.size >= LIVENESS_MAX_ENTRIES) {
        // Map preserves insertion order; drop the oldest entry. A brief
        // overshoot under concurrency is harmless.
        const oldest = livenessCache.keys().next().value;
        if (oldest !== undefined) livenessCache.delete(oldest);
    }
    livenessCache.set(key, {
        exists,
        tokenVersion: normalizeTokenVersion(tokenVersion),
        versionKnown,
        expiresAt: Date.now() + ttlMs
    });
}

function invalidateLiveness(userId) {
    livenessCache.delete(String(userId));
}

// Local invalidation is enough for one instance; publish the same event so
// every other instance drops its cached tokenVersion immediately instead of
// waiting out AUTH_LIVENESS_TTL_MS.
async function invalidateLivenessEverywhere(userId) {
    invalidateLiveness(userId);
    try {
        const { publishAuthRevoke } = require('../utils/redis');
        return await publishAuthRevoke(userId);
    } catch {
        return false;
    }
}

async function initLivenessRevocationSubscriber() {
    try {
        const { subscribeAuthRevoke } = require('../utils/redis');
        return await subscribeAuthRevoke((userId) => invalidateLiveness(userId));
    } catch {
        return false;
    }
}

function pruneExpiredLivenessEntries(now = Date.now()) {
    for (const [key, entry] of livenessCache) {
        if (!entry || !entry.expiresAt || entry.expiresAt <= now) {
            livenessCache.delete(key);
        }
    }
    return livenessCache.size;
}

const livenessSweepTimer = setInterval(() => pruneExpiredLivenessEntries(), LIVENESS_SWEEP_MS);
if (typeof livenessSweepTimer.unref === 'function') livenessSweepTimer.unref();

// Test helper: drop cached liveness decisions.
function clearLivenessCache() {
    livenessCache.clear();
}

function canReadTokenVersion(User) {
    if (!User || typeof User.findById !== 'function') return false;
    // Unit tests commonly provide a bare mock model without a Mongoose
    // connection; honour it. In production the connection is the gate.
    if (User.findById._isMockFunction && !User.schema) return true;
    try {
        return Number(User.db && User.db.readyState) === 1;
    } catch {
        return false;
    }
}

async function readTokenVersion(User, userId) {
    const query = User.findById(userId);
    if (query && typeof query.select === 'function') {
        const projected = query.select('tokenVersion');
        return typeof projected.lean === 'function' ? projected.lean() : projected;
    }
    return query;
}

async function getUserAuthState(userId, options = {}) {
    if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(userId))) {
        return { exists: false, tokenVersion: 0, versionKnown: false };
    }

    const key = String(userId);
    if (!options.forceRefresh) {
        const cached = livenessCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return {
                exists: cached.exists,
                tokenVersion: cached.tokenVersion,
                versionKnown: cached.versionKnown
            };
        }
    }

    let exists = false;
    let tokenVersion = 0;
    let versionKnown = false;
    try {
        // Required lazily so this module can be imported before mongoose is
        // configured, and so unit tests can mock the User model.
        const User = require('../models/User');
        if (!User || typeof User.exists !== 'function') {
            setLivenessEntry(userId, true);
            return { exists: true, tokenVersion: 0, versionKnown: false };
        }
        const doc = await User.exists({
            _id: userId,
            // Honour an optional isActive flag if/when one is introduced, so
            // suspending a user takes effect without another code change.
            $or: [{ isActive: { $ne: false } }],
            // Banned accounts fail liveness exactly like deleted ones (same
            // 403, no distinction leaked to the client).
            isBanned: { $ne: true }
        });
        exists = Boolean(doc);

        if (exists && doc && typeof doc === 'object' && doc.tokenVersion !== undefined) {
            tokenVersion = normalizeTokenVersion(doc.tokenVersion);
            versionKnown = true;
        } else if (exists && canReadTokenVersion(User)) {
            const row = await readTokenVersion(User, userId);
            if (row) {
                tokenVersion = normalizeTokenVersion(row.tokenVersion);
                versionKnown = true;
            }
        }
    } catch (error) {
        // Fail closed: if the account cannot be confirmed as live (DB error),
        // do not authenticate — otherwise a DB outage silently disables the
        // deleted/banned-account check. Cache the rejection for a few seconds
        // so a struggling database is not hammered by every request.
        console.error('Auth liveness check failed (failing closed):', error.message);
        setLivenessEntry(userId, false, 5000);
        return { exists: false, tokenVersion: 0, versionKnown: false };
    }

    setLivenessEntry(userId, exists, undefined, tokenVersion, versionKnown);
    return { exists, tokenVersion, versionKnown };
}

async function userExists(userId) {
    const state = await getUserAuthState(userId);
    return state.exists;
}

// Returns the account liveness plus whether the token's version is still the
// account's current version. A cached mismatch is re-read once so a token
// minted by another process after the bump is not rejected on stale cache.
async function checkUserSession(userId, tokenVersion) {
    let state = await getUserAuthState(userId);
    if (state.exists && state.versionKnown && !isTokenVersionCurrent(tokenVersion, state.tokenVersion)) {
        state = await getUserAuthState(userId, { forceRefresh: true });
    }
    return {
        exists: state.exists,
        tokenCurrent: !state.versionKnown || isTokenVersionCurrent(tokenVersion, state.tokenVersion)
    };
}

async function isUserSessionValid(userId, tokenVersion) {
    const session = await checkUserSession(userId, tokenVersion);
    return session.exists && session.tokenCurrent;
}

// Middleware to check authentication
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    let user;
    try {
        user = await new Promise((resolve, reject) => {
            jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded);
            });
        });
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    // Normalize user ID access across all routes
    // Support both legacy and new token payloads: { id } or { userId }
    const userId = user.userId || user.id || user._id;

    // A signature-valid token for an account that no longer exists must not
    // authenticate. Without this, account deletion is not actually effective
    // for up to the token lifetime. The same lookup enforces tokenVersion so
    // password changes, logout-all and bans revoke already-issued sessions.
    const session = await checkUserSession(userId, user.tokenVersion);
    if (!session.exists) {
        return res.status(403).json({ success: false, message: 'Account is no longer active' });
    }
    if (!session.tokenCurrent) {
        return res.status(403).json({ success: false, message: 'Token has been revoked. Please sign in again.' });
    }

    req.userId = userId;
    req.user = {
        ...user,
        id: userId,
        userId: userId,
        _id: userId
    };
    next();
};

module.exports = {
    authenticateToken,
    clearLivenessCache,
    invalidateLiveness,
    invalidateLivenessEverywhere,
    initLivenessRevocationSubscriber,
    getUserAuthState,
    checkUserSession,
    isUserSessionValid,
    normalizeTokenVersion,
    isTokenVersionCurrent,
    userExists,
    pruneExpiredLivenessEntries,
    livenessCacheSize: () => livenessCache.size
};
