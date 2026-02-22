// Meeting Socket.IO Handler - WebRTC Signaling Server
const jwt = require('jsonwebtoken');
const MeetingRoom = require('../models/MeetingRoom');

module.exports = (io) => {
    const meetingNamespace = io.of('/meeting');
    
    // Authentication middleware
    meetingNamespace.use((socket, next) => {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication error'));
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });
    
    // Connection handler
    meetingNamespace.on('connection', (socket) => {
        console.log(`Meeting user connected: ${socket.userId}`);
        
        // Join room
        socket.on('join-room', async ({ roomId, userId }) => {
            try {
                socket.join(roomId);
                socket.roomId = roomId;
                
                // Update meeting status
                const meeting = await MeetingRoom.findOne({ roomId });
                if (meeting) {
                    if (meeting.status === 'scheduled') {
                        meeting.status = 'ongoing';
                        meeting.startedAt = new Date();
                    }
                    
                    const participant = meeting.participants.find(
                        p => p.user.toString() === userId
                    );
                    
                    if (participant) {
                        participant.status = 'joined';
                        participant.joinedAt = new Date();
                    } else {
                        meeting.participants.push({
                            user: userId,
                            status: 'joined',
                            joinedAt: new Date()
                        });
                    }
                    
                    await meeting.save();
                }
                
                // Notify others
                socket.to(roomId).emit('user-connected', {
                    userId: socket.userId,
                    userName: socket.user.fullName || 'User'
                });
                
                console.log(`User ${socket.userId} joined room: ${roomId}`);
            } catch (error) {
                console.error('Join room error:', error);
                socket.emit('error', { message: error.message });
            }
        });
        
        // WebRTC signaling - Offer
        socket.on('offer', ({ offer, to, roomId, userName }) => {
            socket.to(roomId).emit('offer', {
                offer,
                userId: socket.userId,
                userName
            });
        });
        
        // WebRTC signaling - Answer
        socket.on('answer', ({ answer, to, roomId }) => {
            socket.to(roomId).emit('answer', {
                answer,
                userId: socket.userId
            });
        });
        
        // WebRTC signaling - ICE Candidate
        socket.on('ice-candidate', ({ candidate, to, roomId }) => {
            socket.to(roomId).emit('ice-candidate', {
                candidate,
                userId: socket.userId
            });
        });
        
        // Chat message
        socket.on('chat-message', ({ roomId, message, userName }) => {
            meetingNamespace.to(roomId).emit('chat-message', {
                message,
                userId: socket.userId,
                userName,
                timestamp: new Date()
            });
        });
        
        // Raise hand
        socket.on('raise-hand', ({ roomId, userName }) => {
            socket.to(roomId).emit('hand-raised', {
                userId: socket.userId,
                userName
            });
        });
        
        // Reaction
        socket.on('reaction', ({ roomId, reaction }) => {
            meetingNamespace.to(roomId).emit('reaction', {
                userId: socket.userId,
                reaction
            });
        });
        
        // Mic toggle
        socket.on('mic-toggle', ({ roomId, isMicOn }) => {
            socket.to(roomId).emit('mic-toggled', {
                userId: socket.userId,
                isMicOn
            });
        });
        
        // Camera toggle
        socket.on('camera-toggle', ({ roomId, isCameraOn }) => {
            socket.to(roomId).emit('camera-toggled', {
                userId: socket.userId,
                isCameraOn
            });
        });
        
        // Whiteboard drawing
        socket.on('whiteboard-draw', ({ roomId, data }) => {
            socket.to(roomId).emit('whiteboard-draw', { data });
        });
        
        // Whiteboard clear
        socket.on('whiteboard-clear', ({ roomId }) => {
            socket.to(roomId).emit('whiteboard-clear');
        });
        
        // Start recording
        socket.on('start-recording', async ({ roomId }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                
                if (!meeting) {
                    throw new Error('Meeting not found');
                }
                
                if (meeting.host.toString() !== socket.userId) {
                    throw new Error('Only host can start recording');
                }
                
                meeting.recording = {
                    startedAt: new Date()
                };
                
                await meeting.save();
                
                meetingNamespace.to(roomId).emit('recording-started');
                
                console.log(`Recording started for room: ${roomId}`);
            } catch (error) {
                console.error('Start recording error:', error);
                socket.emit('error', { message: error.message });
            }
        });
        
        // Stop recording
        socket.on('stop-recording', async ({ roomId }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                
                if (!meeting) {
                    throw new Error('Meeting not found');
                }
                
                if (meeting.host.toString() !== socket.userId) {
                    throw new Error('Only host can stop recording');
                }
                
                meeting.recording.endedAt = new Date();
                // In production, save recording URL from media server
                meeting.recording.url = `recordings/${roomId}_${Date.now()}.webm`;
                
                await meeting.save();
                
                meetingNamespace.to(roomId).emit('recording-stopped');
                
                console.log(`Recording stopped for room: ${roomId}`);
            } catch (error) {
                console.error('Stop recording error:', error);
                socket.emit('error', { message: error.message });
            }
        });
        
        // Breakout rooms
        socket.on('create-breakout-room', async ({ roomId, participants }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                
                if (!meeting) {
                    throw new Error('Meeting not found');
                }
                
                if (meeting.host.toString() !== socket.userId) {
                    throw new Error('Only host can create breakout rooms');
                }
                
                const breakoutRoomId = `${roomId}_breakout_${Date.now()}`;
                
                // Notify participants to join breakout room
                participants.forEach(userId => {
                    meetingNamespace.to(roomId).emit('join-breakout-room', {
                        breakoutRoomId,
                        userId
                    });
                });
                
                console.log(`Breakout room created: ${breakoutRoomId}`);
            } catch (error) {
                console.error('Create breakout room error:', error);
                socket.emit('error', { message: error.message });
            }
        });
        
        // Leave room
        socket.on('leave-room', async ({ roomId }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                
                if (meeting) {
                    const participant = meeting.participants.find(
                        p => p.user.toString() === socket.userId
                    );
                    
                    if (participant) {
                        participant.status = 'left';
                        participant.leftAt = new Date();
                    }
                    
                    await meeting.save();
                }
                
                socket.to(roomId).emit('user-disconnected', {
                    userId: socket.userId
                });
                
                socket.leave(roomId);
                
                console.log(`User ${socket.userId} left room: ${roomId}`);
            } catch (error) {
                console.error('Leave room error:', error);
            }
        });
        
        // Disconnect
        socket.on('disconnect', async () => {
            console.log(`Meeting user disconnected: ${socket.userId}`);
            
            if (socket.roomId) {
                try {
                    const meeting = await MeetingRoom.findOne({ roomId: socket.roomId });
                    
                    if (meeting) {
                        const participant = meeting.participants.find(
                            p => p.user.toString() === socket.userId
                        );
                        
                        if (participant) {
                            participant.status = 'left';
                            participant.leftAt = new Date();
                        }
                        
                        await meeting.save();
                    }
                    
                    socket.to(socket.roomId).emit('user-disconnected', {
                        userId: socket.userId
                    });
                } catch (error) {
                    console.error('Disconnect cleanup error:', error);
                }
            }
        });
    });
    
    console.log('✓ Meeting Socket.IO server initialized');
};
