const SupportTicket = require('../models/SupportTicket');
const SupportAgent = require('../models/SupportAgent');

module.exports = (io) => {
    const supportNamespace = io.of('/support');

    supportNamespace.on('connection', (socket) => {
        console.log('Support client connected:', socket.id);

        // User joins a ticket room
        socket.on('join-ticket', async (data) => {
            const { ticketId, userType, userName } = data;
            socket.join(ticketId);
            socket.ticketId = ticketId;
            socket.userType = userType; // 'user' or 'agent'
            socket.userName = userName;

            console.log(`${userType} ${userName} joined ticket ${ticketId}`);

            // Notify others in the room
            socket.to(ticketId).emit('user-joined', {
                userName,
                userType,
                timestamp: new Date()
            });

            // Send typing indicator support
            socket.on('typing', () => {
                socket.to(ticketId).emit('user-typing', {
                    userName,
                    userType
                });
            });

            socket.on('stop-typing', () => {
                socket.to(ticketId).emit('user-stop-typing', {
                    userName,
                    userType
                });
            });
        });

        // Send message
        socket.on('send-message', async (data) => {
            try {
                const { ticketId, message, senderType, senderName } = data;

                const ticket = await SupportTicket.findOne({ ticketId });
                if (!ticket) {
                    socket.emit('error', { message: 'Ticket not found' });
                    return;
                }

                // Add message to ticket
                ticket.messages.push({
                    sender: senderType,
                    senderName,
                    message,
                    timestamp: new Date(),
                    read: false
                });

                await ticket.save();

                // Broadcast message to all in the room
                supportNamespace.to(ticketId).emit('new-message', {
                    sender: senderType,
                    senderName,
                    message,
                    timestamp: new Date()
                });

                console.log(`Message sent in ticket ${ticketId} by ${senderName}`);
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Mark messages as read
        socket.on('mark-read', async (data) => {
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

        // Agent updates ticket status
        socket.on('update-status', async (data) => {
            try {
                const { ticketId, status } = data;
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

        // Agent assigns ticket to themselves
        socket.on('assign-ticket', async (data) => {
            try {
                const { ticketId, agentId, agentName } = data;
                const ticket = await SupportTicket.findOne({ ticketId });
                
                if (ticket) {
                    ticket.assignedTo = agentId;
                    ticket.status = 'in-progress';
                    await ticket.save();

                    supportNamespace.to(ticketId).emit('ticket-assigned', {
                        agentName,
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
