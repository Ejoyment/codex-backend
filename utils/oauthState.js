/**
 * OAuth State Token Utility
 *
 * Signs a short-lived JWT for OAuth state parameters instead of passing
 * raw userId. Prevents session fixation / account takeover via crafted
 * OAuth callback URLs.
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRY = '10m'; // OAuth flows should complete within 10 minutes

/**
 * Create a signed state token containing the userId.
 */
function createStateToken(userId) {
    if (!SECRET) throw new Error('JWT_SECRET required for OAuth state tokens');
    return jwt.sign({ userId, purpose: 'oauth_state' }, SECRET, { expiresIn: EXPIRY });
}

/**
 * Verify and decode a state token. Returns userId or throws.
 */
function verifyStateToken(token) {
    if (!SECRET) throw new Error('JWT_SECRET required for OAuth state tokens');
    const decoded = jwt.verify(token, SECRET);
    if (decoded.purpose !== 'oauth_state') throw new Error('Invalid state token purpose');
    return decoded.userId;
}

module.exports = { createStateToken, verifyStateToken };
