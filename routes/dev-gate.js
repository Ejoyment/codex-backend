/**
 * Dev-gate verification endpoint (rec 9).
 *
 * POST /api/dev-gate/verify { password } -> { success, gateToken }
 *
 * The password is checked server-side against DEV_GATE_PASSWORD (never
 * shipped to the bundle). Strictly rate-limited: 5 attempts per 15 minutes
 * per IP — this is a password-guessing surface.
 */
const express = require('express');
const crypto = require('crypto');
const { devGateLimiter } = require('../middleware/rateLimits');
const { devGateEnabled, mintGateToken, COOKIE_NAME } = require('../middleware/devGate');

const router = express.Router();

router.post('/verify', devGateLimiter, (req, res) => {
    if (!devGateEnabled()) {
        return res.status(404).json({
            success: false,
            message: 'Dev access is not configured on this deployment yet.',
        });
    }
    const presented = Buffer.from(String((req.body && req.body.password) || ''));
    const expected = Buffer.from(process.env.DEV_GATE_PASSWORD);
    const ok = presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
    if (!ok) {
        return res.status(401).json({ success: false, message: 'Wrong password. Try again.' });
    }
    const gateToken = mintGateToken();
    // Cookie for same-origin flows; the JSON token covers cross-origin fetch.
    res.cookie(COOKIE_NAME, gateToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });
    return res.json({ success: true, gateToken });
});

module.exports = router;
