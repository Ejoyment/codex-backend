// Realtime collaboration namespace for the multiplayer overlay:
//  - presence (who is in the editor / sandbox / design view)
//  - hover cursors + caret positions + typing indicators
//  - inline audio channels (WebRTC signaling scoped to a session)
//  - live design-code sync + parity broadcasts
const { resolveSocketUser } = require('./socketAuth');
const crypto = require('crypto');
const CollaborationSession = require('../models/CollaborationSession');
const DesignSyncSession = require('../models/DesignSyncSession');
const EphemeralSandbox = require('../models/EphemeralSandbox');
// Tenant isolation (audit rec 7): join is the choke point — joiners receive
// peer lists, cursors, and live design-code sync, so an existing sessionId
// must be authorized, not merely known.
const { userIsCompanyMember } = require('../middleware/workspaceAccess');

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
let colorIndex = 0;

function pickColor() {
    const c = COLORS[colorIndex % COLORS.length];
    colorIndex += 1;
    return c;
}

module.exports = (io) => {
    const ns = io.of('/collab');

    ns.use(async (socket, next) => {
        try {
            const { userId, decoded } = await resolveSocketUser(socket);
            socket.userId = userId;
            socket.user = { ...decoded, id: userId };
            next();
        } catch (e) {
            next(e);
        }
    });

    ns.on('connection', (socket) => {
        const joinedSessions = new Set();

        // Join per-user room so AI agent progress can be streamed real-time
        socket.join(`agent:${socket.userId}`);
        socket.on('agent:join', () => socket.join(`agent:${socket.userId}`));
        socket.on('agent:leave', () => socket.leave(`agent:${socket.userId}`));

        // Cross-session spoof guard: awareness/audio/design events trust a
        // client-supplied sessionId and `socket.to(room)` / `ns.to(room)`
        // deliver without the sender having joined. Require every
        // sessionId-scoped packet to target a session this socket joined
        // (join is where access is authorized). session:join establishes
        // membership, so it is exempt. Errors must be emitted explicitly —
        // packet-middleware errors never reach the client.
        socket.use(([event, payload], next) => {
            try {
                const sid = payload && payload.sessionId;
                if (event !== 'session:join' && typeof sid === 'string' && !joinedSessions.has(sid)) {
                    socket.emit('error', { message: 'Not in this session' });
                    return;
                }
            } catch (e) {
                socket.emit('error', { message: 'Invalid packet' });
                return;
            }
            next();
        });

        async function upsertSession(sessionId, type, contextRef, companyId) {
            let session;
            if (sessionId) {
                session = await CollaborationSession.findOne({ sessionId });
            }
            if (session) {
                // Existing session: only the creator, a current participant,
                // or a member of its company may (re)join. Everyone else is
                // 'Access denied' — knowing a sessionId grants nothing.
                const uid = String(socket.userId);
                const isCreator = session.createdBy && String(session.createdBy) === uid;
                const isParticipant = (session.participants || [])
                    .some(p => p.userId?.toString?.() === uid);
                if (isCreator || isParticipant) return session;
                if (session.companyId && await userIsCompanyMember(session.companyId, socket.userId)) {
                    return session;
                }
                const denied = new Error('Access denied');
                denied.code = 'FORBIDDEN';
                throw denied;
            }
            // New session: if it claims a company, the creator must belong to it
            // (prevents stamping foreign companyIds onto attacker-owned rows).
            if (companyId && !(await userIsCompanyMember(companyId, socket.userId))) {
                const denied = new Error('Access denied');
                denied.code = 'FORBIDDEN';
                throw denied;
            }
            sessionId = sessionId || `col_${crypto.randomBytes(8).toString('hex')}`;
            session = await CollaborationSession.create({
                sessionId,
                type: type || 'editor',
                contextRef: contextRef || null,
                companyId: companyId || null,
                createdBy: socket.userId,
                audioChannelId: `audio_${sessionId}`
            });
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

        // Inline audio WebRTC signaling scoped to a session. The packet guard
        // requires sessionId membership. The former unscoped `{ to }` fallback
        // (signal any user directly) was removed — undocumented, unconsumed by
        // any client, and a cross-user injection vector.
        socket.on('audio:signal', ({ sessionId, data }) => {
            if (sessionId) {
                socket.to(`session:${sessionId}`).emit('audio:signal', {
                    from: socket.userId, sessionId, data
                });
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

        // Ephemeral sandbox viewers join `sandbox:<key>` to receive status.
        // This used to accept ANY room string — including `agent:<userId>`
        // (live agent progress goes there via realtimeBus) and `session:*`.
        // Only sandbox rooms are joinable, and only with DB-backed access
        // (owner or company member of the sandbox).
        socket.on('room:join', async ({ room } = {}) => {
            try {
                if (typeof room !== 'string' || !room || room.length > 160) return;
                if (!room.startsWith('sandbox:')) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }
                const key = room.slice('sandbox:'.length);
                const sandbox = await EphemeralSandbox.findOne({ sandboxKey: key });
                if (!sandbox) {
                    socket.emit('error', { message: 'Sandbox not found' });
                    return;
                }
                if (sandbox.status === 'expired') {
                    socket.emit('error', { message: 'Sandbox expired' });
                    return;
                }
                const uid = String(socket.userId);
                const isOwner = sandbox.createdBy && String(sandbox.createdBy) === uid;
                if (!isOwner && !(sandbox.companyId && await userIsCompanyMember(sandbox.companyId, socket.userId))) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }
                socket.join(room);
                socket.emit('room:joined', { room });
            } catch (err) {
                console.error('room:join error', err.message);
                socket.emit('error', { message: 'Access denied' });
            }
        });
        socket.on('room:leave', ({ room } = {}) => {
            if (typeof room === 'string' && room.startsWith('sandbox:')) socket.leave(room);
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
