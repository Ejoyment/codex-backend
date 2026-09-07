// Meeting Socket.IO Handler - WebRTC Signaling Server
const jwt = require('jsonwebtoken');
const MeetingRoom = require('../models/MeetingRoom');
const User = require('../models/User');

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
            socket.userId = decoded.userId || decoded.id;
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });
    
    // Connection handler
    meetingNamespace.on('connection', (socket) => {
        console.log(`Meeting user connected: ${socket.userId}`);
        socket.data.userId = socket.userId;
        
        // Socket-specific room so WebRTC signaling reaches ONE socket (a user can have several sessions)
        socket.join(`socket:${socket.id}`);
        
        // Join user-specific room for targeted real-time updates (profile changes, etc.)
        socket.join(`user:${socket.userId}`);
        
        // Join room
        socket.on('join-room', async ({ roomId, userId }) => {
            try {
                socket.join(roomId);
                socket.roomId = roomId;
                
                // Fetch real user profile from DB so name/picture are accurate
                let userName = 'User';
                let profilePicture = null;
                let userEmail = null;
                
                try {
                    const user = await User.findById(userId).select('fullName email profilePicture');
                    if (user) {
                        userName = user.fullName || 'User';
                        profilePicture = user.profilePicture || null;
                        userEmail = user.email || null;
                        socket.userName = userName;
                        socket.profilePicture = profilePicture;
                        socket.data.userName = userName;
                        socket.data.profilePicture = profilePicture;
                        socket.data.userEmail = userEmail;
                    }
                } catch (err) {
                    console.error('Failed to fetch user for meeting room:', err.message);
                }
                
                // Update meeting status
                const meeting = await MeetingRoom.findOne({ roomId });
                if (meeting) {
                    if (meeting.status === 'scheduled') {
                        meeting.status = 'ongoing';
                        meeting.startedAt = new Date();
                    }
                    
                    const participant = meeting.participants.find(
                        p => p.user && p.user.toString() === userId
                    );
                    
                    if (participant) {
                        participant.status = 'joined';
                        participant.joinedAt = new Date();
                    } else if (userId) {
                        meeting.participants.push({
                            user: userId,
                            status: 'joined',
                            joinedAt: new Date()
                        });
                    }
                    
                    await meeting.save();
                }
                
                // Notify others with full profile data + the new socket's identity so peers
                // can be keyed by socket.id (a single user may have several sessions).
                socket.to(roomId).emit('user-connected', {
                    socketId: socket.id,
                    userId: socket.userId,
                    userName,
                    profilePicture,
                    email: userEmail
                });

                // Tell the new joiner which sockets are already in the room (people are
                // keyed by socket.id downstream, so list every live socket, not users).
                let peerList = [];
                try {
                    const roomSockets = await meetingNamespace.in(roomId).fetchSockets();
                    peerList = roomSockets
                        .filter(s => s.data && String(s.data.userId) !== String(socket.userId))
                        .map(s => ({
                            socketId: s.id,
                            userId: String(s.data.userId),
                            userName: s.data.userName || 'User',
                            profilePicture: s.data.profilePicture || null
                        }));
                } catch (err) {
                    console.error('Failed to list room sockets:', err.message);
                }
                socket.emit('room-users', { users: peerList });
                
                console.log(`User ${socket.userId} joined room: ${roomId} as ${userName}`);
            } catch (error) {
                console.error('Join room error:', error);
                socket.emit('error', { message: error.message });
            }
        });
        
        // WebRTC signaling - Offer (delivered only to the target socket)
        socket.on('offer', ({ offer, to, roomId, userName, gen }) => {
            socket.to('socket:' + to).emit('offer', {
                offer,
                socketId: socket.id,
                userId: socket.userId,
                userName: userName || socket.userName || 'User',
                gen
            });
        });
        
        // WebRTC signaling - Answer (delivered only to the target socket)
        socket.on('answer', ({ answer, to, roomId, gen }) => {
            socket.to('socket:' + to).emit('answer', {
                answer,
                socketId: socket.id,
                userId: socket.userId,
                gen
            });
        });
        
        // WebRTC signaling - ICE Candidate (delivered only to the target socket)
        socket.on('ice-candidate', ({ candidate, to, roomId }) => {
            socket.to('socket:' + to).emit('ice-candidate', {
                candidate,
                socketId: socket.id,
                userId: socket.userId
            });
        });
        
        // Chat message
        socket.on('chat-message', ({ roomId, message, userName }) => {
            meetingNamespace.to(roomId).emit('chat-message', {
                message,
                userId: socket.userId,
                userName: userName || socket.userName || 'User',
                timestamp: new Date()
            });
        });
        
        // Raise hand
        socket.on('raise-hand', ({ roomId, userName }) => {
            socket.to(roomId).emit('hand-raised', {
                userId: socket.userId,
                userName: userName || socket.userName || 'User'
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
                socketId: socket.id,
                userId: socket.userId,
                isMicOn
            });
        });
        
        // Camera toggle
        socket.on('camera-toggle', ({ roomId, isCameraOn }) => {
            socket.to(roomId).emit('camera-toggled', {
                socketId: socket.id,
                userId: socket.userId,
                isCameraOn
            });
        });
        
        // Screen share started
        socket.on('screen-share-started', ({ roomId }) => {
            socket.to(roomId).emit('screen-share-started', {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName || 'User'
            });
        });
        
        // Screen share stopped
        socket.on('screen-share-stopped', ({ roomId }) => {
            socket.to(roomId).emit('screen-share-stopped', {
                socketId: socket.id,
                userId: socket.userId
            });
        });
        
        // Profile updated - broadcast to room so all participants see changes in real-time
        socket.on('profile-updated', ({ roomId, profileData }) => {
            meetingNamespace.to(roomId).emit('profile-updated', {
                userId: socket.userId,
                ...profileData
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
        
        // Host ends meeting for everyone
        socket.on('meeting-ended', async ({ roomId }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                if (meeting) {
                    meeting.status = 'completed';
                    meeting.endedAt = new Date();
                    await meeting.save();
                }
                meetingNamespace.to(roomId).emit('meeting-ended');
                console.log(`Meeting ended for room: ${roomId}`);
            } catch (error) {
                console.error('Meeting ended error:', error);
            }
        });

        // Leave room
        socket.on('leave-room', async ({ roomId }) => {
            try {
                const meeting = await MeetingRoom.findOne({ roomId });
                
                if (meeting) {
                    const participant = meeting.participants.find(
                        p => p.user && p.user.toString() === socket.userId
                    );
                    
                    if (participant) {
                        participant.status = 'left';
                        participant.leftAt = new Date();
                    }
                    
                    await meeting.save();
                }
                
                socket.to(roomId).emit('user-disconnected', {
                    socketId: socket.id,
                    userId: socket.userId,
                    userName: socket.userName || 'User'
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
                            p => p.user && p.user.toString() === socket.userId
                        );
                        
                        if (participant) {
                            participant.status = 'left';
                            participant.leftAt = new Date();
                        }
                        
                        await meeting.save();
                    }
                    
                    socket.to(socket.roomId).emit('user-disconnected', {
                        socketId: socket.id,
                        userId: socket.userId,
                        userName: socket.userName || 'User'
                    });
                } catch (error) {
                    console.error('Disconnect cleanup error:', error);
                }
            }
        });
    });
    
    console.log('✓ Meeting Socket.IO server initialized');
};
