// Notification Socket.IO namespace.
//
// Kept on its own /notifications namespace so notification traffic is isolated
// from the collab/messaging sockets and the client can hold a single dedicated
// connection for the lifetime of the session.
const { resolveSocketUser } = require('./socketAuth');
const NotificationService = require('./notificationService');

module.exports = (io) => {
    const ns = io.of('/notifications');

    ns.use(async (socket, next) => {
        try {
            const { userId } = await resolveSocketUser(socket);
            socket.userId = String(userId);
            next();
        } catch (error) {
            next(error);
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
