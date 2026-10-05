// Support Socket.IO namespace — live support chat.
//
// Mirrors the REST contract in routes/support.js: the same JWT pair (user
// token carries id/userId; agent token carries agentId+role), agents may act
// on any ticket, users only on their own, guest tickets need the matching
// guestEmail capability. Previously the namespace had NO authentication and
// accepted client-claimed userType/agentId — anyone could read any ticket and
// resolve/assign it.
const jwt = require('jsonwebtoken');
const SupportTicket = require('../models/SupportTicket');
const SupportAgent = require('../models/SupportAgent');
const User = require('../models/User');
const { MAX_TICKET_MESSAGES } = require('./retention');

const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];

module.exports = (io) => {
    const supportNamespace = io.of('/support');

    supportNamespace.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication error'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.agentId) {
                const agent = await SupportAgent.findById(decoded.agentId);
                if (!agent) return next(new Error('Authentication error'));
                socket.isAgent = true;
                socket.agentId = String(agent._id);
                socket.agentName = agent.name || 'Support Agent';
                socket.userId = null;
            } else if (decoded.id || decoded.userId) {
                socket.isAgent = false;
                socket.userId = String(decoded.id || decoded.userId);
            } else {
                return next(new Error('Authentication error'));
            }
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    supportNamespace.on('connection', (socket) => {
        console.log('Support client connected:', socket.id);

        // ticketIds this socket was authorized to join; every ticket-scoped
        // event below must target one of them.
        const joinedTickets = new Set();

        // Sender display name is server-derived (REST parity): agent record,
        // the user's profile, or the guest's own name — never the client.
        async function resolveSenderName(ticket) {
            if (socket.isAgent) return socket.agentName;
            if (ticket && !ticket.userId && ticket.guestName) return ticket.guestName;
            try {
                const user = await User.findById(socket.userId);
                if (user?.fullName) return user.fullName;
            } catch (e) { /* fall through */ }
            return 'User';
        }

        // Guard: any event carrying a ticketId must target a joined ticket
        // (join-ticket establishes authorization). Packet-middleware errors
        // never reach the client, so notify explicitly and drop.
        socket.use(([event, payload], next) => {
            try {
                const tid = payload && payload.ticketId;
                if (event !== 'join-ticket' && typeof tid === 'string' && !joinedTickets.has(tid)) {
                    socket.emit('error', { message: 'Not in this ticket' });
                    return;
                }
            } catch (e) {
                socket.emit('error', { message: 'Invalid packet' });
                return;
            }
            next();
        });

        // User joins a ticket room
        socket.on('join-ticket', async (data = {}) => {
            try {
                const { ticketId, guestEmail } = data;
                if (typeof ticketId !== 'string' || !ticketId || ticketId.length > 128) {
                    socket.emit('error', { message: 'Invalid ticket id' });
                    return;
                }

                const ticket = await SupportTicket.findOne({ ticketId });
                if (!ticket) {
                    socket.emit('error', { message: 'Ticket not found' });
                    return;
                }

                // Ownership (REST parity): agents any ticket; users their own;
                // guest tickets require the guestEmail capability.
                if (!socket.isAgent) {
                    if (ticket.userId) {
                        if (String(ticket.userId) !== socket.userId) {
                            socket.emit('error', { message: 'Access denied' });
                            return;
                        }
                    } else {
                        const ticketEmail = (ticket.guestEmail || '').toLowerCase();
                        const provided = typeof guestEmail === 'string' ? guestEmail.toLowerCase() : '';
                        if (!ticketEmail || provided !== ticketEmail) {
                            socket.emit('error', { message: 'Access denied' });
                            return;
                        }
                    }
                }

                const userType = socket.isAgent ? 'agent' : 'user';
                socket.join(ticketId);
                socket.ticketId = ticketId;
                socket.userType = userType; // server-derived, not client-claimed
                socket.userName = await resolveSenderName(ticket);
                joinedTickets.add(ticketId);
                socket.emit('ticket:joined', { ticketId });

                console.log(`${userType} ${socket.userName} joined ticket ${ticketId}`);

                // Notify others in the room
                socket.to(ticketId).emit('user-joined', {
                    userName: socket.userName,
                    userType,
                    timestamp: new Date()
                });

                // If an agent joined, emit a system message to notify the user
                if (socket.isAgent) {
                    supportNamespace.to(ticketId).emit('system-message', {
                        ticketId,
                        message: `${socket.userName} joined the chat`,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                console.error('join-ticket error:', error);
                socket.emit('error', { message: 'Access denied' });
            }
        });

        // Typing indicators (registered once per connection — previously they
        // were re-registered inside every join-ticket, leaking listeners that
        // kept emitting to rooms the socket had left).
        socket.on('typing', () => {
            if (!socket.ticketId) return;
            socket.to(socket.ticketId).emit('user-typing', {
                userName: socket.userName,
                userType: socket.userType
            });
        });

        socket.on('stop-typing', () => {
            if (!socket.ticketId) return;
            socket.to(socket.ticketId).emit('user-stop-typing', {
                userName: socket.userName,
                userType: socket.userType
            });
        });

        // Send message
        socket.on('send-message', async (data = {}) => {
            try {
                const { ticketId, message } = data;
                if (typeof message !== 'string' || !message.trim()) {
                    socket.emit('error', { message: 'Message content is required' });
                    return;
                }

                const ticket = await SupportTicket.findOne({ ticketId });
                if (!ticket) {
                    socket.emit('error', { message: 'Ticket not found' });
                    return;
                }

                // Role and display name come from the token/profile (REST
                // parity) — the client-supplied senderType/senderName were
                // trusted verbatim before.
                const senderType = socket.isAgent ? 'agent' : 'user';
                const senderName = await resolveSenderName(ticket);

                // Add message to ticket (capped thread — REST parity).
                if (ticket.messages.length >= MAX_TICKET_MESSAGES) {
                    return socket.emit('ticket:error', { message: 'Ticket thread is full — please open a follow-up ticket.' });
                }
                ticket.messages.push({
                    sender: senderType,
                    senderName,
                    message: message.trim(),
                    timestamp: new Date(),
                    read: false
                });

                await ticket.save();

                // Broadcast message to all in the room
                supportNamespace.to(ticketId).emit('new-message', {
                    ticketId,
                    sender: senderType,
                    senderName,
                    message: message.trim(),
                    timestamp: new Date()
                });

                console.log(`Message sent in ticket ${ticketId} by ${senderName}`);
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Mark messages as read
        socket.on('mark-read', async (data = {}) => {
            try {
                const { ticketId } = data;
                const ticket = await SupportTicket.findOne({ ticketId });

                if (ticket) {
                    ticket.messages.forEach(msg => {
                        if (msg.sender !== socket.userType) {
                            msg.read = true;
                        }
                    });
                    await ticket.save();
                }
            } catch (error) {
                console.error('Mark read error:', error);
            }
        });

        // Agent updates ticket status (REST: verifySupportAgent only)
        socket.on('update-status', async (data = {}) => {
            try {
                if (!socket.isAgent) {
                    socket.emit('error', { message: 'Access denied: agents only' });
                    return;
                }
                const { ticketId, status } = data;
                if (!STATUSES.includes(status)) {
                    socket.emit('error', { message: 'Invalid status' });
                    return;
                }
                const ticket = await SupportTicket.findOne({ ticketId });

                if (ticket) {
                    ticket.status = status;
                    if (status === 'resolved' || status === 'closed') {
                        ticket.resolvedAt = new Date();
                    }
                    await ticket.save();

                    supportNamespace.to(ticketId).emit('status-updated', {
                        status,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                console.error('Update status error:', error);
            }
        });

        // Agent assigns ticket to themselves (REST: assignedTo comes from the
        // token's agent id — client-supplied agentId/agentName ignored)
        socket.on('assign-ticket', async (data = {}) => {
            try {
                if (!socket.isAgent) {
                    socket.emit('error', { message: 'Access denied: agents only' });
                    return;
                }
                const { ticketId } = data;
                const ticket = await SupportTicket.findOne({ ticketId });

                if (ticket) {
                    ticket.assignedTo = socket.agentId;
                    ticket.status = 'in-progress';
                    await ticket.save();

                    supportNamespace.to(ticketId).emit('ticket-assigned', {
                        agentName: socket.agentName,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                console.error('Assign ticket error:', error);
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log('Support client disconnected:', socket.id);
            if (socket.ticketId) {
                socket.to(socket.ticketId).emit('user-left', {
                    userName: socket.userName,
                    userType: socket.userType,
                    timestamp: new Date()
                });
            }
        });
    });

    return supportNamespace;
};
