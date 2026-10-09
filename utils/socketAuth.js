/**
 * Shared Socket.IO handshake auth (rec 8 follow-up: socket liveness).
 *
 * Every namespace previously verified only the JWT signature, so a deleted
 * or banned account kept its sockets (terminal control, debug rooms, agent
 * runs) until the token expired. These helpers add the same liveness check
 * REST gets from authenticateToken — fail-closed, cached per user.
 *
 * Agent tokens (support namespace: agentId without userId) are NOT covered
 * here; supportSocket resolves those against SupportAgent directly (unknown
 * agents are already rejected) and uses assertSocketUserLive for the user
 * branch only.
 */
const jwt = require('jsonwebtoken');
const { userExists } = require('../middleware/auth');

function decodeSocketToken(token) {
    if (!token) throw new Error('Authentication error');
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new Error('Authentication error');
    }
}

async function assertSocketUserLive(userId) {
    if (!userId) throw new Error('Authentication error');
    if (!(await userExists(userId))) {
        throw new Error('Account is no longer active');
    }
}

// Full handshake for user-token namespaces: signature + liveness.
// Returns { userId, decoded }; throws connect_error-worthy Errors.
async function resolveSocketUser(socket) {
    const decoded = decodeSocketToken(socket.handshake.auth?.token);
    const userId = decoded.userId || decoded.id || decoded._id;
    await assertSocketUserLive(userId);
    return { userId, decoded };
}

module.exports = { decodeSocketToken, assertSocketUserLive, resolveSocketUser };
