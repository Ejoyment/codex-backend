// Messaging Socket.IO Handler - Real-time team chat
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');

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

        // Join a channel room so messages are broadcast to only channel members
        socket.on('join-channel', ({ channelId }) => {
            socket.join(`channel:${channelId}`);
            socket.channelId = channelId;
        });

        // Leave a channel
        socket.on('leave-channel', ({ channelId }) => {
            socket.leave(`channel:${channelId}`);
        });

        // Send a real-time message to the channel
        socket.on('chat-message', async ({ channelId, message, userName, avatar }) => {
            const payload = {
                _id: Date.now().toString(),
                channel: channelId,
                sender: {
                    _id: socket.userId,
                    fullName: userName || 'User',
                    profilePicture: avatar || null
                },
                content: message,
                createdAt: new Date().toISOString()
            };

            // Broadcast to all other participants in the channel (and the sender)
            messagingNamespace.to(`channel:${channelId}`).emit('chat-message', payload);
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
