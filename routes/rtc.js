/**
 * WebRTC ICE servers (rec 9).
 *
 * Long-lived TURN credentials used to ship in the JS bundle via
 * NEXT_PUBLIC_TURN_* — anyone could lift them and relay arbitrary traffic
 * through our TURN server. Now the client fetches short-lived credentials
 * from this authenticated endpoint instead.
 *
 * Uses the standard TURN REST API scheme (coturn `use-auth-secret`):
 *   username = <expiryEpoch>:<userId>
 *   password = base64(HMAC_SHA1(TURN_STATIC_SECRET, username))
 *
 * Without TURN_URL + TURN_STATIC_SECRET configured, only STUN is returned
 * (same as the old default).
 */
const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const STUN_URL = process.env.STUN_URL || 'stun:stun.l.google.com:19302';
const TURN_TTL_SECONDS = 60 * 60; // 1 hour

router.get('/ice-servers', authenticateToken, (req, res) => {
    const servers = [{ urls: STUN_URL }];
    const turnUrl = process.env.TURN_URL;
    const turnSecret = process.env.TURN_STATIC_SECRET;
    if (turnUrl && turnSecret) {
        const expiresAt = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
        const username = `${expiresAt}:${req.userId}`;
        const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
        servers.push({ urls: turnUrl, username, credential });
    } else if (turnUrl && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        // Legacy static credentials: still better than the bundle (only
        // authenticated users receive them), but prefer TURN_STATIC_SECRET
        // for time-boxed credentials.
        servers.push({
            urls: turnUrl,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL,
        });
    }
    res.json({ success: true, iceServers: servers, ttlSeconds: TURN_TTL_SECONDS });
});

module.exports = router;
