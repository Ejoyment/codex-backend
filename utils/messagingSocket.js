// Messaging Socket.IO Handler - Real-time team chat
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const User = require('../models/User');
const { isChannelMember, canPostToChannel } = require('../utils/channelPolicy');
const { userIsCompanyMember } = require('../middleware/workspaceAccess');

module.exports = (io) => {
    const messagingNamespace = io.of('/messaging');

    // Authentication middleware
    messagingNamespace.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId || decoded.id;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    messagingNamespace.on('connection', (socket) => {
        console.log(`Messaging user connected: ${socket.userId}`);

        // channelId -> channel doc (company/members/type) captured at join
        // time; used to authorize posting without an extra query per message.
        const joinedChannels = new Map();

        // Read access mirrors channelPolicy: private/direct channels require
        // channel membership; public/announcement require company membership.
        async function canReadChannel(channel) {
            if (isChannelMember(channel, socket.userId)) return true;
            if (channel.type === 'private' || channel.type === 'direct') return false;
            if (!channel.company) return false;
            return userIsCompanyMember(channel.company, socket.userId);
        }

        // Join a channel room so messages are broadcast to only channel members
        socket.on('join-channel', async ({ channelId } = {}) => {
            try {
                if (typeof channelId !== 'string' || !channelId || channelId.length > 128) {
                    socket.emit('error', { message: 'Invalid channel' });
                    return;
                }
                const channel = await Channel.findById(channelId)
                    .select('company members type archived');
                if (!channel) {
                    // 404/403 convention: unknown id is 'Channel not found',
                    // foreign is 'Access denied'.
                    socket.emit('error', { message: 'Channel not found' });
                    return;
                }
                if (!(await canReadChannel(channel))) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }
                socket.join(`channel:${channelId}`);
                joinedChannels.set(channelId, channel);
                socket.emit('channel:joined', { channelId });
            } catch (err) {
                console.error('join-channel error', err.message);
                socket.emit('error', { message: 'Access denied' });
            }
        });

        // Leave a channel
        socket.on('leave-channel', ({ channelId } = {}) => {
            if (typeof channelId !== 'string') return;
            socket.leave(`channel:${channelId}`);
            joinedChannels.delete(channelId);
        });

        // Cross-channel spoof guard: chat/typing events trust a client-supplied
        // channelId and broadcast to `channel:<id>` without the sender having
        // joined. Require every channelId-scoped packet to target a channel
        // this socket joined (join is where read access is authorized).
        // join-channel/leave-channel are exempt. Packet-middleware errors never
        // reach the client, so notify explicitly and drop by returning.
        socket.use(([event, payload], next) => {
            try {
                const cid = payload && payload.channelId;
                if (event !== 'join-channel' && event !== 'leave-channel' &&
                    typeof cid === 'string' && !joinedChannels.has(cid)) {
                    socket.emit('error', { message: 'Not in this channel' });
                    return;
                }
            } catch (e) {
                socket.emit('error', { message: 'Invalid packet' });
                return;
            }
            next();
        });

        // Send a real-time message to the channel
        socket.on('chat-message', async ({ channelId, message }) => {
            try {
                const channel = joinedChannels.get(channelId);
                if (!channel) {
                    socket.emit('error', { message: 'Not in this channel' });
                    return;
                }
                // Posting policy (same as REST POST /messaging/messages):
                // channel membership, admins-only for announcements.
                const post = canPostToChannel(channel, socket.userId);
                if (!post.ok) {
                    socket.emit('error', { message: post.reason || 'Access denied' });
                    return;
                }
                // Identity comes from the DB, never the client — the old
                // userName/avatar payload let any member impersonate anyone.
                const user = await User.findById(socket.userId)
                    .select('fullName profilePicture');
                const payload = {
                    _id: Date.now().toString(),
                    channel: channelId,
                    sender: {
                        _id: socket.userId,
                        fullName: user?.fullName || 'User',
                        profilePicture: user?.profilePicture || null
                    },
                    content: message,
                    createdAt: new Date().toISOString()
                };

                // Broadcast to all other participants in the channel (and the sender)
                messagingNamespace.to(`channel:${channelId}`).emit('chat-message', payload);
            } catch (err) {
                console.error('chat-message error', err.message);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing', ({ channelId, userName }) => {
            socket.to(`channel:${channelId}`).emit('typing', {
                userId: socket.userId,
                userName
            });
        });

        socket.on('stop-typing', ({ channelId }) => {
            socket.to(`channel:${channelId}`).emit('stop-typing', {
                userId: socket.userId
            });
        });

        socket.on('disconnect', () => {
            console.log(`Messaging user disconnected: ${socket.userId}`);
        });
    });

    console.log('✓ Messaging Socket.IO server initialized');
};
