// Notification Socket.IO namespace.
//
// Kept on its own /notifications namespace so notification traffic is isolated
// from the collab/messaging sockets and the client can hold a single dedicated
// connection for the lifetime of the session.
const jwt = require('jsonwebtoken');
const NotificationService = require('./notificationService');

module.exports = (io) => {
    const ns = io.of('/notifications');

    ns.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication error'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id || decoded._id;
            if (!userId) return next(new Error('Authentication error'));
            socket.userId = String(userId);
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    ns.on('connection', (socket) => {
        // Every connection for this user lands in the same room, so one emit
        // reaches all their open tabs.
        socket.join(`user:${socket.userId}`);

        // Client asks for the authoritative count; the socket is the only
        // guaranteed-live channel, so keep it cheap to re-sync after reconnect.
        socket.on('notification:sync', async (ack) => {
            try {
                const count = await NotificationService.getUnreadCount(socket.userId);
                const byCategory = await NotificationService.getUnreadByCategory(socket.userId);
                const payload = { count, byCategory };
                socket.emit('notification:count', payload);
                if (typeof ack === 'function') ack(payload);
            } catch (error) {
                console.error('[notifications] sync failed:', error.message);
            }
        });

        socket.on('notification:markAllRead', async (ack) => {
            try {
                const modified = await NotificationService.markAllAsRead(socket.userId);
                socket.emit('notification:count', { count: 0, byCategory: {} });
                if (typeof ack === 'function') ack({ success: true, modified });
            } catch (error) {
                console.error('[notifications] markAllRead failed:', error.message);
            }
        });

        socket.on('disconnect', () => {
            // socket.io removes the room membership for us.
        });
    });

    return ns;
};
