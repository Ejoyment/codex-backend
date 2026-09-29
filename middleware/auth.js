const jwt = require('jsonwebtoken');

// Cached liveness check so a deleted or deactivated account cannot keep using an
// already-issued token. JWTs are valid for 24h, so without this a user who
// deletes their account (or is banned) retains full access until it expires.
const LIVENESS_TTL_MS = parseInt(process.env.AUTH_LIVENESS_TTL_MS, 10) || 30000;
const livenessCache = new Map(); // userId -> { exists, expiresAt }

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
            $or: [{ isActive: { $ne: false } }]
        });
        exists = Boolean(doc);
    } catch (error) {
        // Never lock users out because the liveness probe itself failed.
        console.error('Auth liveness check failed:', error.message);
        return true;
    }

    livenessCache.set(String(userId), { exists, expiresAt: Date.now() + LIVENESS_TTL_MS });
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

module.exports = { authenticateToken, clearLivenessCache };
