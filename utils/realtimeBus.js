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

// Push a notification to a user's sockets on the /notifications namespace.
// Called after the notification row is persisted, so a client that misses the
// push can still fetch it from the REST API.
function emitNotification(userId, payload) {
    if (_io && userId) {
        _io.of('/notifications').to(`user:${userId}`).emit('notification:new', payload);
        return true;
    }
    return false;
}

function emitProfileUpdate(userId, profileData) {
    if (!_io) return;

    // Emit to meeting namespace (for users in meeting rooms)
    const meetingNamespace = _io.of('/meeting');
    meetingNamespace.to(`user:${userId}`).emit('profile-updated', {
        userId,
        ...profileData
    });

    // Emit to default namespace (for users on other platform pages)
    _io.to(`user:${userId}`).emit('profile-updated', {
        userId,
        ...profileData
    });
}

function emitWorkspaceChange(workspaceId, event, data) {
    if (!_io) return;

    const payload = {
        workspaceId,
        event,
        data,
        timestamp: new Date().toISOString()
    };

    _io.to(`workspace:${workspaceId}`).emit('workspace:change', payload);

    const terminalNamespace = _io.of('/terminal');
    terminalNamespace.emit('workspace:change', payload);
}

module.exports = { setIO, emitCollab, emitSandbox, emitAgentProgress, emitNotification, emitProfileUpdate, emitWorkspaceChange };
