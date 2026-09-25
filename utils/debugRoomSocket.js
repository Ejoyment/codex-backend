// Debug Room Socket.IO Handler
// WebRTC signaling relay + sequenced terminal mirroring + control negotiation
// for Phase 3 ephemeral Debug Rooms.
//
// File/cursor sync is deliberately NOT handled here — that already works
// through the default namespace's collab:* events wired to
// collaborationService in server.js. A Debug Room guest joins the same
// `file:${fileId}` rooms the host has open, via the existing collab:join flow.

const jwt = require('jsonwebtoken');
const DebugRoom = require('../models/DebugRoom');
const terminalService = require('./terminalService');

// roomId -> { seq: number, buffer: [{seq, data}], unsubscribe: fn, hostSessionId: string }
const terminalMirrors = new Map();
const SCROLLBACK_LIMIT = 500;

// Set once the namespace is initialized in module.exports below, so that
// notifyClosed() can be called from routes/debug-rooms.js (a different file)
// without threading the io instance through the whole call chain.
let namespaceRef = null;

function startMirror(namespace, roomId, terminalSessionId) {
    if (terminalMirrors.has(roomId)) return; // already mirroring

    const state = { seq: 0, buffer: [], unsubscribe: null, hostSessionId: terminalSessionId };

    try {
        state.unsubscribe = terminalService.onData(terminalSessionId, (data) => {
            state.seq += 1;
            state.buffer.push({ seq: state.seq, data });
            if (state.buffer.length > SCROLLBACK_LIMIT) state.buffer.shift();
            namespace.to(roomId).emit('room:terminal-chunk', { seq: state.seq, data });
        });
        terminalMirrors.set(roomId, state);
    } catch (error) {
        console.error(`Failed to start terminal mirror for room ${roomId}:`, error.message);
    }
}

function stopMirror(roomId) {
    const state = terminalMirrors.get(roomId);
    if (state && state.unsubscribe) state.unsubscribe();
    terminalMirrors.delete(roomId);
}

function notifyClosed(roomId) {
    if (namespaceRef) namespaceRef.to(roomId).emit('room:closed');
    stopMirror(roomId);
}

function init(io) {
    const debugRoomNamespace = io.of('/debug-room');
    namespaceRef = debugRoomNamespace;

    debugRoomNamespace.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId || decoded.id;
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    debugRoomNamespace.on('connection', (socket) => {
        console.log(`Debug Room user connected: ${socket.userId}`);

        // Join a room. Guests should only call this after the host has
        // approved (DebugRoom.status === 'active') — enforced here.
        socket.on('room:join', async ({ roomId }) => {
            try {
                const room = await DebugRoom.findById(roomId);
                if (!room) throw new Error('Room not found');
                if (room.status !== 'active') throw new Error('Room is not active');

                const isParticipant = room.participants.some((p) => String(p.user) === String(socket.userId));
                if (!isParticipant) throw new Error('Not a participant in this room');

                socket.join(roomId);
                socket.debugRoomId = roomId;
                await DebugRoom.updateOne({ _id: roomId }, { $set: { lastActivityAt: new Date() } });

                if (room.terminalSessionId) {
                    startMirror(debugRoomNamespace, roomId, room.terminalSessionId);
                    const mirror = terminalMirrors.get(roomId);
                    if (mirror) {
                        // Replay buffered scrollback so a guest who joins mid-session
                        // still sees history, not just new output.
                        socket.emit('room:terminal-history', { chunks: mirror.buffer });
                    }
                }

                socket.to(roomId).emit('room:user-joined', { userId: socket.userId });
                console.log(`User ${socket.userId} joined debug room: ${roomId}`);
            } catch (error) {
                socket.emit('room:error', { message: error.message });
            }
        });

        // Guest requests a resync from a specific sequence number after a dropout.
        socket.on('room:terminal-resync', ({ roomId, fromSeq }) => {
            const mirror = terminalMirrors.get(roomId);
            if (!mirror) return;
            const missed = mirror.buffer.filter((chunk) => chunk.seq > (fromSeq || 0));
            socket.emit('room:terminal-history', { chunks: missed });
        });

        // WebRTC signaling relay (offer/answer/ICE), matching the shape used
        // by utils/meetingSocket.js.
        socket.on('room:signal', ({ roomId, signal }) => {
            socket.to(roomId).emit('room:signal', {
                from: socket.userId,
                signal
            });
        });

        // Control negotiation — actual role change happens via
        // POST /api/debug-rooms/:id/control; this just delivers the live
        // notification to whoever's in the room.
        socket.on('room:control-request', ({ roomId }) => {
            socket.to(roomId).emit('room:control-request', { from: socket.userId });
        });

        socket.on('room:control-update', ({ roomId, targetUserId, role }) => {
            debugRoomNamespace.to(roomId).emit('room:control-update', { targetUserId, role });
        });

        socket.on('room:leave', ({ roomId }) => {
            socket.leave(roomId);
            socket.to(roomId).emit('room:user-left', { userId: socket.userId });
        });

        socket.on('disconnect', () => {
            console.log(`Debug Room user disconnected: ${socket.userId}`);
            if (socket.debugRoomId) {
                socket.to(socket.debugRoomId).emit('room:user-left', { userId: socket.userId });
            }
        });
    });

    return debugRoomNamespace;
}

module.exports = init;
module.exports.notifyClosed = notifyClosed;