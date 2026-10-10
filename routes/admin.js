/**
 * Platform admin endpoints (decision 3.10).
 *
 * There is no platform-admin role in the data model, so these endpoints use a
 * static ADMIN_API_KEY bearer (`x-admin-key` header) instead. Fail-closed:
 * without the env var every call 403s. Strictly rate-limited (static secret
 * guessing surface). Currently: user ban/unban (ToS termination enforcement).
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const router = express.Router();

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: require('../utils/redis').getRateLimitStore(),
    passOnStoreError: true,
    message: { success: false, message: 'Too many attempts, please try again later.' },
});

function requireAdminKey(req, res, next) {
    const configured = process.env.ADMIN_API_KEY || '';
    const presented = String(req.headers['x-admin-key'] || '');
    const a = Buffer.from(presented);
    const b = Buffer.from(configured);
    if (!configured || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
}

async function setBanned(userId, banned, reason) {
    const user = await User.findById(userId);
    if (!user) return null;
    user.isBanned = banned;
    user.bannedAt = banned ? new Date() : null;
    if (reason !== undefined) user.banReason = banned ? String(reason || '') : '';
    await user.save();
    return user;
}

router.post('/users/:id/ban', adminLimiter, requireAdminKey, async (req, res) => {
    try {
        const user = await setBanned(req.params.id, true, req.body && req.body.reason);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        console.log(`Admin ban: ${user._id} (${user.email})`);
        res.json({ success: true, userId: String(user._id), isBanned: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/users/:id/unban', adminLimiter, requireAdminKey, async (req, res) => {
    try {
        const user = await setBanned(req.params.id, false);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        console.log(`Admin unban: ${user._id} (${user.email})`);
        res.json({ success: true, userId: String(user._id), isBanned: false });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
