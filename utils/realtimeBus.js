// Shared emitter so REST routes can push events to the /collab Socket.IO namespace
// without importing the socket setup directly (avoids circular dependencies).
let _io = null;

function setIO(io) { _io = io; }

function emitCollab(room, event, payload) {
    if (_io) {
        _io.of('/collab').to(room).emit(event, payload);
    }
}

function emitSandbox(sandboxKey, event, payload) {
    if (_io) {
        _io.of('/collab').to(`sandbox:${sandboxKey}`).emit(event, payload);
    }
}

// Emit real-time progress for a long-running AI agent task
// to a per-user room on the /collab namespace so the UI can stream
// iteration steps as they happen.
function emitAgentProgress(userId, payload) {
    if (_io) {
        const fullPayload = { userId, timestamp: new Date().toISOString(), ...payload };
        _io.of('/collab').to(`agent:${userId}`).emit('agent:progress', fullPayload);
        _io.of('/collab').to(`agent:${userId}`).emit('agent:status', fullPayload);
    }
}

module.exports = { setIO, emitCollab, emitSandbox, emitAgentProgress };
