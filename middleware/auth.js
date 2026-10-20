const jwt = require('jsonwebtoken');

// Cached liveness check so a deleted or deactivated account cannot keep using an
// already-issued token. JWTs are valid for 24h, so without this a user who
// deletes their account (or is banned) retains full access until it expires.
const LIVENESS_TTL_MS = parseInt(process.env.AUTH_LIVENESS_TTL_MS, 10) || 30000;
const livenessCache = new Map(); // userId -> { exists, expiresAt }

// Entries used only to be pruned when the same user was looked up again, so
// every distinct account ever seen stayed in memory for the process lifetime.
// A periodic sweep plus a hard cap bound the cache (audit finding: unpruned caches).
const LIVENESS_MAX_ENTRIES = parseInt(process.env.AUTH_LIVENESS_MAX_ENTRIES, 10) || 50000;
const LIVENESS_SWEEP_MS = parseInt(process.env.AUTH_LIVENESS_SWEEP_MS, 10) || 60000;

function setLivenessEntry(userId, exists, ttlMs = LIVENESS_TTL_MS) {
    const key = String(userId);
    if (!livenessCache.has(key) && livenessCache.size >= LIVENESS_MAX_ENTRIES) {
        // Map preserves insertion order; drop the oldest entry. A brief
        // overshoot under concurrency is harmless.
        const oldest = livenessCache.keys().next().value;
        if (oldest !== undefined) livenessCache.delete(oldest);
    }
    livenessCache.set(key, { exists, expiresAt: Date.now() + ttlMs });
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

async function userExists(userId) {
    if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(userId))) return false;

    const cached = livenessCache.get(String(userId));
    if (cached && cached.expiresAt > Date.now()) {
        return cached.exists;
    }

    let exists = false;
    try {
        // Required lazily so this module can be imported before mongoose is
        // configured, and so unit tests can mock the User model.
        const User = require('../models/User');
        if (!User || typeof User.exists !== 'function') return true;
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
    } catch (error) {
        // Fail closed: if the account cannot be confirmed as live (DB error),
        // do not authenticate — otherwise a DB outage silently disables the
        // deleted/banned-account check. Cache the rejection for a few seconds
        // so a struggling database is not hammered by every request.
        console.error('Auth liveness check failed (failing closed):', error.message);
        setLivenessEntry(userId, false, 5000);
        return false;
    }

    setLivenessEntry(userId, exists);
    return exists;
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
            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
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
    // for up to the token lifetime.
    if (!(await userExists(userId))) {
        return res.status(403).json({ success: false, message: 'Account is no longer active' });
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
    userExists,
    pruneExpiredLivenessEntries,
    livenessCacheSize: () => livenessCache.size
};
