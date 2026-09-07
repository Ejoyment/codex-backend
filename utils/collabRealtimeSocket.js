// Realtime collaboration namespace for the multiplayer overlay:
//  - presence (who is in the editor / sandbox / design view)
//  - hover cursors + caret positions + typing indicators
//  - inline audio channels (WebRTC signaling scoped to a session)
//  - live design-code sync + parity broadcasts
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const CollaborationSession = require('../models/CollaborationSession');
const DesignSyncSession = require('../models/DesignSyncSession');

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
let colorIndex = 0;

function pickColor() {
    const c = COLORS[colorIndex % COLORS.length];
    colorIndex += 1;
    return c;
}

module.exports = (io) => {
    const ns = io.of('/collab');

    ns.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication error'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId || decoded.id || decoded._id;
            socket.user = { ...decoded, id: socket.userId };
            next();
        } catch (e) {
            next(new Error('Authentication error'));
        }
    });

    ns.on('connection', (socket) => {
        const joinedSessions = new Set();

        async function upsertSession(sessionId, type, contextRef, companyId) {
            let session;
            if (sessionId) {
                session = await CollaborationSession.findOne({ sessionId });
            }
            if (!session) {
                sessionId = sessionId || `col_${crypto.randomBytes(8).toString('hex')}`;
                session = await CollaborationSession.create({
                    sessionId,
                    type: type || 'editor',
                    contextRef: contextRef || null,
                    companyId: companyId || null,
                    createdBy: socket.userId,
                    audioChannelId: `audio_${sessionId}`
                });
            }
            return session;
        }

        function participantView(p) {
            return {
                userId: p.userId?.toString?.() || p.userId,
                name: p.name,
                color: p.color,
                audioOn: p.audioOn,
                videoOn: p.videoOn,
                typing: p.typing,
                cursor: p.cursor,
                lastSeen: p.lastSeen
            };
        }

        async function broadcastPresence(session) {
            const session2 = await CollaborationSession.findOne({ _id: session._id });
            ns.to(`session:${session.sessionId}`).emit('presence:update', {
                sessionId: session.sessionId,
                participants: session2.participants.map(participantView)
            });
        }

        socket.on('session:join', async (payload = {}) => {
            try {
                const { sessionId, type, contextRef, companyId, name } = payload;
                const session = await upsertSession(sessionId, type, contextRef, companyId);

                socket.join(`session:${session.sessionId}`);
                joinedSessions.add(session.sessionId);

                const existing = session.participants.find(p => p.userId?.toString() === socket.userId);
                if (existing) {
                    existing.lastSeen = new Date();
                } else {
                    session.participants.push({
                        userId: socket.userId,
                        name: name || socket.user.fullName || 'Anonymous',
                        color: pickColor(),
                        joinedAt: new Date(),
                        lastSeen: new Date()
                    });
                }
                await session.save();

                socket.emit('session:joined', {
                    sessionId: session.sessionId,
                    audioChannelId: session.audioChannelId,
                    participants: session.participants.map(participantView)
                });
                await broadcastPresence(session);
            } catch (err) {
                console.error('session:join error', err.message);
                socket.emit('error', { message: err.message });
            }
        });

        async function updateSelf(sessionId, mutate) {
            const session = await CollaborationSession.findOne({ sessionId });
            if (!session) return null;
            const p = session.participants.find(x => x.userId?.toString() === socket.userId);
            if (!p) return null;
            mutate(p);
            p.lastSeen = new Date();
            await session.save();
            return session;
        }

        socket.on('awareness:cursor', async ({ sessionId, cursor }) => {
            const session = await updateSelf(sessionId, p => { p.cursor = cursor; });
            if (session) socket.to(`session:${sessionId}`).emit('awareness:cursor', {
                userId: socket.userId, sessionId, cursor
            });
        });

        socket.on('awareness:hover', async ({ sessionId, cursor }) => {
            const session = await updateSelf(sessionId, p => { p.cursor = cursor; });
            if (session) socket.to(`session:${sessionId}`).emit('awareness:hover', {
                userId: socket.userId, sessionId, cursor
            });
        });

        socket.on('awareness:typing', async ({ sessionId, typing }) => {
            const session = await updateSelf(sessionId, p => { p.typing = typing; });
            if (session) {
                socket.to(`session:${sessionId}`).emit('awareness:typing', {
                    userId: socket.userId, sessionId, typing
                });
                await broadcastPresence(session);
            }
        });

        socket.on('media:toggle', async ({ sessionId, audioOn, videoOn }) => {
            const session = await updateSelf(sessionId, p => {
                if (typeof audioOn === 'boolean') p.audioOn = audioOn;
                if (typeof videoOn === 'boolean') p.videoOn = videoOn;
            });
            if (session) await broadcastPresence(session);
        });

        // Inline audio WebRTC signaling scoped to a session.
        socket.on('audio:signal', ({ sessionId, to, data }) => {
            if (sessionId) {
                socket.to(`session:${sessionId}`).emit('audio:signal', {
                    from: socket.userId, sessionId, data
                });
            } else if (to) {
                ns.to(`user:${to}`).emit('audio:signal', { from: socket.userId, data });
            }
        });

        // Live design-code sync.
        socket.on('design:change', ({ sessionId, code, language }) => {
            if (sessionId) socket.to(`session:${sessionId}`).emit('design:change', {
                userId: socket.userId, sessionId, code, language
            });
        });

        socket.on('design:parity', ({ sessionId, parity }) => {
            if (sessionId) ns.to(`session:${sessionId}`).emit('design:parity', { sessionId, parity });
        });

        socket.on('session:leave', async ({ sessionId }) => {
            try {
                const session = await CollaborationSession.findOne({ sessionId });
                if (session) {
                    session.participants = session.participants.filter(p => p.userId?.toString() !== socket.userId);
                    await session.save();
                    socket.leave(`session:${sessionId}`);
                    joinedSessions.delete(sessionId);
                    await broadcastPresence(session);
                }
            } catch (err) { console.error('session:leave error', err.message); }
        });

        // Generic room join (used by ephemeral sandbox viewers to receive status).
        socket.on('room:join', ({ room }) => {
            if (room) socket.join(room);
        });
        socket.on('room:leave', ({ room }) => {
            if (room) socket.leave(room);
        });

        socket.on('disconnect', async () => {
            for (const sessionId of joinedSessions) {
                try {
                    const session = await CollaborationSession.findOne({ sessionId });
                    if (session) {
                        session.participants = session.participants.filter(p => p.userId?.toString() !== socket.userId);
                        await session.save();
                        await broadcastPresence(session);
                    }
                } catch (err) { console.error('disconnect cleanup error', err.message); }
            }
        });
    });

    console.log('✓ Collaboration realtime (/collab) namespace initialized');
    return ns;
};
