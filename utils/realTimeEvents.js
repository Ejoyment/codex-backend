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

module.exports = { setIO, emitProfileUpdate };
