// Real-time event broadcaster for REST routes
// Allows profile updates and other events to be pushed to connected Socket.IO clients
let _io = null;

function setIO(io) {
    _io = io;
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

module.exports = { setIO, emitProfileUpdate, emitWorkspaceChange };
