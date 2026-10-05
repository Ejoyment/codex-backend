/**
 * Server-side dev gate (rec 9).
 *
 * The prelaunch gate used to be a client-side password comparison against
 * NEXT_PUBLIC_DEV_PASSWORD — the expected value shipped in the JS bundle, so
 * anyone could read it and the "locked" auth pages were never actually
 * locked (the signup API stayed wide open regardless).
 *
 * Now: POST /api/dev-gate/verify checks the password server-side against
 * DEV_GATE_PASSWORD and returns a time-boxed bearer token. Registration and
 * login surfaces (signup, signin, Google OAuth, OTP) require that token while
 * the gate is enabled. When DEV_GATE_PASSWORD is unset the gate is off and
 * every check passes through untouched.
 *
 * Token format: <expEpochHex>.<hmacHex> where the HMAC binds the expiry to
 * both JWT_SECRET and the current DEV_GATE_PASSWORD — rotating the password
 * invalidates all outstanding tokens without any server-side state.
 */
const crypto = require('crypto');

const COOKIE_NAME = 'dev_gate';
const HEADER_NAME = 'x-dev-gate';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function devGateEnabled() {
    return (process.env.DEV_GATE_PASSWORD || '').length > 0;
}

function gateMacKey() {
    return `${process.env.JWT_SECRET || ''}::${process.env.DEV_GATE_PASSWORD || ''}`;
}

function mintGateToken(ttlMs = TOKEN_TTL_MS) {
    const exp = (Date.now() + ttlMs).toString(16);
    const sig = crypto.createHmac('sha256', gateMacKey()).update(`dev-gate:${exp}`).digest('hex');
    return `${exp}.${sig}`;
}

// The presented token, from header, cookie, query, or body — in that order.
function tokenFromRequest(req) {
    const header = req.headers ? req.headers[HEADER_NAME] : undefined;
    if (typeof header === 'string' && header) return header;
    const cookieHeader = (req.headers && req.headers.cookie) || '';
    const cookieMatch = /(?:^|;\s*)dev_gate=([^;]+)/.exec(cookieHeader);
    if (cookieMatch) {
        try {
            return decodeURIComponent(cookieMatch[1]);
        } catch {
            return cookieMatch[1];
        }
    }
    if (req.query && typeof req.query.gate_token === 'string' && req.query.gate_token) {
        return req.query.gate_token;
    }
    if (req.body && typeof req.body.gate_token === 'string' && req.body.gate_token) {
        return req.body.gate_token;
    }
    return null;
}

function isValidGateToken(token) {
    if (typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const expHex = token.slice(0, dot);
    const presented = token.slice(dot + 1);
    const exp = parseInt(expHex, 16);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const expected = crypto.createHmac('sha256', gateMacKey()).update(`dev-gate:${expHex}`).digest('hex');
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasDevGate(req) {
    if (!devGateEnabled()) return true;
    return isValidGateToken(tokenFromRequest(req));
}

function requireDevGate(req, res, next) {
    if (hasDevGate(req)) return next();
    return res.status(403).json({ success: false, message: 'Dev preview is not open yet.' });
}

module.exports = {
    COOKIE_NAME,
    HEADER_NAME,
    TOKEN_TTL_MS,
    devGateEnabled,
    mintGateToken,
    isValidGateToken,
    tokenFromRequest,
    hasDevGate,
    requireDevGate,
};
