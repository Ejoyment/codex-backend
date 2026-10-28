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
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const entitlementService = require('../server/services/billing/entitlementService');
const companyRoleService = require('../server/services/companyRoleService');
const { recordAdminAction } = require('../utils/adminAudit');

function normalizeTokenVersion(value) {
    if (typeof authMiddleware.normalizeTokenVersion === 'function') {
        return authMiddleware.normalizeTokenVersion(value);
    }
    const version = Number(value);
    return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
}

async function invalidateLiveness(userId) {
    if (typeof authMiddleware.invalidateLivenessEverywhere === 'function') {
        await authMiddleware.invalidateLivenessEverywhere(userId);
        return;
    }
    if (typeof authMiddleware.invalidateLiveness === 'function') {
        authMiddleware.invalidateLiveness(userId);
    }
}

const router = express.Router();

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: require('../utils/redis').getRateLimitStore('admin'),
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
    if (banned) {
        user.tokenVersion = normalizeTokenVersion(user.tokenVersion) + 1;
    }
    await user.save();
    if (banned) await invalidateLiveness(user._id);
    return user;
}

router.post('/users/:id/ban', adminLimiter, requireAdminKey, async (req, res) => {
    try {
        const user = await setBanned(req.params.id, true, req.body && req.body.reason);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        await recordAdminAction({
            action: 'user.ban',
            target: String(user._id),
            details: { email: user.email, reason: user.banReason },
            req,
        });
        res.json({ success: true, userId: String(user._id), isBanned: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/users/:id/unban', adminLimiter, requireAdminKey, async (req, res) => {
    try {
        const user = await setBanned(req.params.id, false);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        await recordAdminAction({
            action: 'user.unban',
            target: String(user._id),
            details: { email: user.email },
            req,
        });
        res.json({ success: true, userId: String(user._id), isBanned: false });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

function validTargetUserId(req, res) {
    if (mongoose.isValidObjectId(req.params.userId)) return true;
    res.status(400).json({ success: false, message: 'Invalid userId' });
    return false;
}

function sendEntitlementError(res, error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
}

router.post('/entitlements/:userId/enterprise', adminLimiter, requireAdminKey, async (req, res) => {
    if (!validTargetUserId(req, res)) return;
    try {
        const body = req.body || {};
        const entitlement = await entitlementService.provisionManualEnterprise({
            userId: req.params.userId,
            amountMinor: body.amountMinor,
            currency: body.currency,
            currentPeriodEnd: body.currentPeriodEnd,
            status: body.status,
            teamId: body.teamId,
        });
        const view = entitlementService.toEntitlementView(entitlement);
        await recordAdminAction({
            action: 'entitlement.enterprise.provision',
            target: view.userId,
            details: {
                status: view.status,
                currency: view.currency,
                amountMinor: view.amountMinor,
                currentPeriodEnd: view.currentPeriodEnd,
                teamId: view.teamId,
            },
            req,
        });
        res.json({ success: true, data: view });
    } catch (error) {
        sendEntitlementError(res, error);
    }
});

// E9 — dry-run by default. Applying requires an explicit `{ "dryRun": false }`
// so a mistyped call cannot silently rewrite every legacy company.
router.post('/companies/roles/backfill', adminLimiter, requireAdminKey, async (req, res) => {
    try {
        const dryRun = !req.body || req.body.dryRun !== false;
        const result = await companyRoleService.backfillMissingRoles({ dryRun });
        await recordAdminAction({
            action: 'company.roles.backfill',
            target: 'companies',
            details: {
                dryRun,
                companiesAffected: result.companiesAffected,
                affectedMembers: result.affectedMembers,
            },
            req,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
});

router.get('/entitlements/:userId', adminLimiter, requireAdminKey, async (req, res) => {
    if (!validTargetUserId(req, res)) return;
    try {
        const view = await entitlementService.getEntitlementView(req.params.userId);
        if (!view) return res.status(404).json({ success: false, message: 'Entitlement not found' });
        res.json({ success: true, data: view });
    } catch (error) {
        sendEntitlementError(res, error);
    }
});

module.exports = router;
