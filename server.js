const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');
const subscriptionRoutes = require('./routes/subscription');
const integrationsRoutes = require('./routes/integrations');
const aiPairRoutes = require('./routes/ai-pair');
const codeEditorRoutes = require('./routes/code-editor');
const invitationsRoutes = require('./routes/invitations');
const messagingRoutes = require('./routes/messaging');
const meetingsRoutes = require('./routes/meetings');
const profileRoutes = require('./routes/profile');
const trialBillingRoutes = require('./routes/trial-billing');
const paystackBillingRoutes = require('./routes/paystack-billing');
const supportRoutes = require('./routes/support');

const app = express();
const http = require('http');
const server = http.createServer(app);
const socketIO = require('socket.io');
const io = socketIO(server, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || 'http://localhost:5500',
            'https://codexincenterprise.online',
            'http://codexincenterprise.online'
        ],
        credentials: true
    }
});

// Trust proxy (required for Render and other reverse proxies)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:5500',
        'https://codexincenterprise.online',
        'http://codexincenterprise.online'
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files with proper headers
app.use('/uploads', express.static('uploads', {
    setHeaders: (res, path) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=31536000');
    }
}));

// Session configuration
app.use(session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
require('./config/passport')(passport);

// MongoDB connection with better error handling and timeout settings
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
    socketTimeoutMS: 45000, // Socket timeout
    family: 4 // Use IPv4, skip trying IPv6
};

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/codex-inc', mongooseOptions)
.then(() => {
    console.log('✓ MongoDB connected successfully');
    console.log('✓ Database:', mongoose.connection.name);
})
.catch(err => {
    console.error('✗ MongoDB connection error:', err.message);
    console.error('✗ Please check your MONGODB_URI in .env file');
    console.error('✗ Make sure your IP is whitelisted in MongoDB Atlas');
});

// Routes
const dashboardRoutes = require('./routes/dashboard');
const companyRoutes = require('./routes/company');
const collaborationRoutes = require('./routes/collaboration');
const githubApiRoutes = require('./routes/github-api');
const discordApiRoutes = require('./routes/discord-api');
const slackApiRoutes = require('./routes/slack-api');
const notionApiRoutes = require('./routes/notion-api');
const figmaApiRoutes = require('./routes/figma-api');
const lspRoutes = require('./routes/lsp');
const vfsRoutes = require('./routes/vfs');
const terminalRoutes = require('./routes/terminal');
const gitRoutes = require('./routes/git');

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai-pair', aiPairRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/code-editor', codeEditorRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/trial-billing', trialBillingRoutes);
app.use('/api/paystack-billing', paystackBillingRoutes);
app.use('/api/support', supportRoutes);

// Integration API routes
app.use('/api/github', githubApiRoutes);
app.use('/api/discord', discordApiRoutes);
app.use('/api/slack', slackApiRoutes);
app.use('/api/notion', notionApiRoutes);
app.use('/api/figma', figmaApiRoutes);
app.use('/api/lsp', lspRoutes);
app.use('/api/vfs', vfsRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/git', gitRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'CODEX INC Backend is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 3000;

// Initialize Socket.IO for support
const supportSocket = require('./utils/supportSocket');
supportSocket(io);

server.listen(PORT, () => {
    console.log(`\n🚀 CODEX INC Server running on port ${PORT}`);
    console.log(`📧 Email service: Resend API (Production Ready)`);
    console.log(`💳 Trial Billing: Active (210s first charge, 2 month second charge)`);
    console.log(`💬 Live Support: Socket.IO Active`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  POST   /api/auth/signup`);
    console.log(`  POST   /api/auth/signin`);
    console.log(`  POST   /api/otp/send`);
    console.log(`  POST   /api/otp/verify`);
    console.log(`  GET    /api/auth/google`);
    console.log(`  GET    /api/auth/facebook`);
    console.log(`  GET    /api/auth/me`);
    console.log(`  POST   /api/auth/upload-photo`);
    console.log(`  PUT    /api/auth/update-profile`);
    console.log(`  POST   /api/auth/change-password`);
    console.log(`  POST   /api/support/tickets`);
    console.log(`  POST   /api/support/agent/login`);
    console.log(`  GET    /api/support/agent/tickets`);
    console.log(`  POST   /api/auth/complete-onboarding`);
    console.log(`  GET    /api/subscription/current`);
    console.log(`  POST   /api/subscription/create-checkout`);
    console.log(`  POST   /api/subscription/upgrade`);
    console.log(`  POST   /api/subscription/cancel`);
    console.log(`  POST   /api/subscription/portal`);
    console.log(`  POST   /api/subscription/webhook/stripe`);
    console.log(`  POST   /api/trial-billing/setup-payment`);
    console.log(`  GET    /api/trial-billing/setup-intent`);
    console.log(`  GET    /api/trial-billing/status`);
    console.log(`  POST   /api/trial-billing/cancel`);
    console.log(`  GET    /api/integrations`);
    console.log(`  GET    /api/integrations/github/auth`);
    console.log(`  GET    /api/integrations/discord/auth`);
    console.log(`  GET    /api/integrations/slack/auth`);
    console.log(`  GET    /api/integrations/notion/auth`);
    console.log(`  GET    /api/integrations/figma/auth`);
    console.log(`  POST   /api/integrations/vscode/connect`);
    console.log(`  DELETE /api/integrations/:platform/disconnect`);
    console.log(`  DELETE /api/auth/delete-account`);
    console.log(`  GET    /api/ai-pair/repos`);
    console.log(`  POST   /api/ai-pair/session`);
    console.log(`  POST   /api/ai-pair/chat`);
    console.log(`  POST   /api/ai-pair/commit`);
    console.log(`  GET    /api/health\n`);
});

// Start billing cron job
const BillingCron = require('./utils/billingCron');
BillingCron.start();
console.log('✓ Billing cron job started (runs every minute)');

// Socket.IO for real-time collaboration
const { Server } = require('socket.io');
const collaborationService = require('./utils/collaborationService');
const terminalService = require('./utils/terminalService');
const jwt = require('jsonwebtoken');

const io = new Server(server, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || 'http://localhost:5500',
            'https://codexincenterprise.online',
            'http://codexincenterprise.online'
        ],
        credentials: true
    }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
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

// Collaboration namespace
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    // Join file collaboration
    socket.on('collab:join', async ({ fileId, user }) => {
        try {
            socket.join(`file:${fileId}`);
            collaborationService.addClient(fileId, socket);
            
            // Notify others
            socket.to(`file:${fileId}`).emit('collab:user-joined', {
                userId: socket.userId,
                user
            });
            
            console.log(`User ${socket.userId} joined file: ${fileId}`);
        } catch (error) {
            console.error('Join error:', error);
            socket.emit('collab:error', { message: error.message });
        }
    });
    
    // Handle sync messages
    socket.on('collab:sync', ({ fileId, message }) => {
        try {
            collaborationService.handleSyncMessage(fileId, socket, message);
        } catch (error) {
            console.error('Sync error:', error);
            socket.emit('collab:error', { message: error.message });
        }
    });
    
    // Handle awareness messages (cursor position, selection)
    socket.on('collab:awareness', ({ fileId, message }) => {
        try {
            collaborationService.handleAwarenessMessage(fileId, socket, message);
        } catch (error) {
            console.error('Awareness error:', error);
            socket.emit('collab:error', { message: error.message });
        }
    });
    
    // Leave file collaboration
    socket.on('collab:leave', ({ fileId }) => {
        try {
            socket.leave(`file:${fileId}`);
            collaborationService.removeClient(fileId, socket);
            
            // Notify others
            socket.to(`file:${fileId}`).emit('collab:user-left', {
                userId: socket.userId
            });
            
            console.log(`User ${socket.userId} left file: ${fileId}`);
        } catch (error) {
            console.error('Leave error:', error);
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId}`);
        
        // Clean up all file connections
        const rooms = Array.from(socket.rooms);
        rooms.forEach(room => {
            if (room.startsWith('file:')) {
                const fileId = room.replace('file:', '');
                collaborationService.removeClient(fileId, socket);
            }
        });
    });
});

console.log('✓ Socket.IO collaboration server initialized');

// Terminal namespace
const terminalNamespace = io.of('/terminal');

terminalNamespace.use((socket, next) => {
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

terminalNamespace.on('connection', (socket) => {
    console.log(`Terminal connected: ${socket.userId}`);
    let currentSession = null;
    
    // Create terminal session
    socket.on('terminal:create', async ({ workspaceId, options }) => {
        try {
            const result = await terminalService.createTerminal(
                socket.userId,
                workspaceId,
                options
            );
            
            currentSession = result.sessionId;
            
            // Register data handler
            terminalService.onData(currentSession, (data) => {
                socket.emit('terminal:data', { data });
            });
            
            socket.emit('terminal:created', result);
            console.log(`Terminal created: ${currentSession}`);
        } catch (error) {
            console.error('Terminal create error:', error);
            socket.emit('terminal:error', { message: error.message });
        }
    });
    
    // Write to terminal
    socket.on('terminal:input', ({ sessionId, data }) => {
        try {
            if (sessionId !== currentSession) {
                throw new Error('Invalid session');
            }
            
            terminalService.write(sessionId, data);
        } catch (error) {
            console.error('Terminal input error:', error);
            socket.emit('terminal:error', { message: error.message });
        }
    });
    
    // Resize terminal
    socket.on('terminal:resize', ({ sessionId, cols, rows }) => {
        try {
            if (sessionId !== currentSession) {
                throw new Error('Invalid session');
            }
            
            terminalService.resize(sessionId, cols, rows);
        } catch (error) {
            console.error('Terminal resize error:', error);
            socket.emit('terminal:error', { message: error.message });
        }
    });
    
    // Get terminal history (simulated only)
    socket.on('terminal:history', ({ sessionId }) => {
        try {
            if (sessionId !== currentSession) {
                throw new Error('Invalid session');
            }
            
            const history = terminalService.getHistory(sessionId);
            socket.emit('terminal:history', { history });
        } catch (error) {
            console.error('Terminal history error:', error);
            socket.emit('terminal:error', { message: error.message });
        }
    });
    
    // Destroy terminal
    socket.on('terminal:destroy', async ({ sessionId }) => {
        try {
            if (sessionId !== currentSession) {
                throw new Error('Invalid session');
            }
            
            await terminalService.destroy(sessionId);
            currentSession = null;
            socket.emit('terminal:destroyed', { sessionId });
            console.log(`Terminal destroyed: ${sessionId}`);
        } catch (error) {
            console.error('Terminal destroy error:', error);
            socket.emit('terminal:error', { message: error.message });
        }
    });
    
    // Disconnect
    socket.on('disconnect', async () => {
        console.log(`Terminal disconnected: ${socket.userId}`);
        
        if (currentSession) {
            try {
                await terminalService.destroy(currentSession);
                console.log(`Auto-destroyed terminal: ${currentSession}`);
            } catch (error) {
                console.error('Auto-destroy error:', error);
            }
        }
    });
});

console.log('✓ Socket.IO terminal server initialized');

