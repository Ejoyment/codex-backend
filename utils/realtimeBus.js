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

module.exports = { setIO, emitCollab, emitSandbox };
