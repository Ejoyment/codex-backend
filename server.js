const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
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
const notificationsRoutes = require('./routes/notifications');

const app = express();
const http = require('http');
const socketIO = require('socket.io');

// Import trial enforcement middleware
const { checkTrialStatus, enforceProjectLimit, enforceAIAccess } = require('./middleware/trial');

let server = null;
let io = null;

function createServer() {
    if (server && io) return { server, io };

    server = http.createServer(app);
    io = socketIO(server, {
        cors: {
            origin: [
                process.env.FRONTEND_URL || 'http://localhost:5500',
                'https://buildrshq.dev',
                'http://buildrshq.dev',
                'https://www.buildrshq.dev',
                'http://www.buildrshq.dev',
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:3002',
                'http://localhost:5500',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:3001',
            ],
            credentials: true
        }
    });

    return { server, io };
}

async function startServer(port = process.env.PORT || 3000) {
    const { server: srv, io: socket } = createServer();

    // Initialize Socket.IO endpoints now that server is created
    const supportSocket = require('./utils/supportSocket');
    supportSocket(socket);

    const meetingSocket = require('./utils/meetingSocket');
    meetingSocket(socket);

    // Messaging Socket.IO namespace for real-time team chat
    const messagingSocket = require('./utils/messagingSocket');
    messagingSocket(socket);

    // Realtime collaboration namespace: presence, hover cursors, inline audio, design sync
    const realtimeBus = require('./utils/realtimeBus');
    realtimeBus.setIO(socket);

    const collabRealtimeSocket = require('./utils/collabRealtimeSocket');
    collabRealtimeSocket(socket);

    // Real-time event broadcaster for REST routes (profile updates, etc.)
    const realTimeEvents = require('./utils/realTimeEvents');
    realTimeEvents.setIO(socket);

    // Ephemeral sandbox provisioner (Instant Bug Handoff)
    const sandboxProvisioner = require('./utils/sandboxProvisioner');
    sandboxProvisioner.init(socket);

    return new Promise((resolve, reject) => {
        srv.listen(port, () => {
            console.log(`\n🚀 CODEX INC Server running on port ${port}`);
            console.log(`📧 Email service: Resend API (Production Ready)`);
            console.log(`💳 Trial Billing: Active (210s first charge, 2 month second charge)`);
            console.log(`💬 Live Support: Socket.IO Active`);
            console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5500'}`);
            resolve(srv);
        }).on('error', reject);
    });
}

// Trust proxy (required for Render and other reverse proxies)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        const allowed = [
            process.env.FRONTEND_URL,
            'https://buildrshq.dev',
            'http://buildrshq.dev',
            'https://www.buildrshq.dev',
            'http://www.buildrshq.dev',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:5500',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
        ].filter(Boolean);

        if (!origin || allowed.includes(origin) || origin.endsWith('.onrender.com') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
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

// Serve the frontend SPA (editor, design-code split, sandbox viewer, etc.) so the
// real-time collaboration features are viewable directly from this server at /app
app.use('/app', express.static('frontend', {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
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
// Note: useNewUrlParser and useUnifiedTopology are deprecated in Mongoose 8+
const mongooseOptions = {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
    socketTimeoutMS: 45000, // Socket timeout
    family: 4 // Use IPv4, skip trying IPv6
};

mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
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
const githubAdvancedRoutes = require('./routes/github-advanced');
const discordApiRoutes = require('./routes/discord-api');
const slackApiRoutes = require('./routes/slack-api');
const notionApiRoutes = require('./routes/notion-api');
const figmaApiRoutes = require('./routes/figma-api');
const lspRoutes = require('./routes/lsp');
const vfsRoutes = require('./routes/vfs');
const terminalRoutes = require('./routes/terminal');
const gitRoutes = require('./routes/git');
const debugRoutes = require('./routes/debug');
const agentConfirmationRoutes = require('./routes/agent-confirmation');
const flutterwaveBillingRoutes = require('./routes/flutterwave-billing');
const projectRoutes = require('./routes/projects');
const figmaContextRoutes = require('./routes/figma-context');
const teamMemoryRoutes = require('./routes/team-memory');
const ticketBridgeRoutes = require('./routes/ticket-bridge');
const collaborationOverlayRoutes = require('./routes/collaboration-overlay');
const debugHandoffRoutes = require('./routes/debug-handoff');
const collabRealtimeRoutes = require('./routes/collab-realtime');
const designSyncRoutes = require('./routes/design-sync');
const deploymentRoutes = require('./routes/deployments');

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/integrations', integrationsRoutes);
// Apply trial middleware to all dashboard routes (protected routes)
app.use('/api/dashboard', checkTrialStatus, dashboardRoutes);
// Apply AI access enforcement to all AI pair routes
app.use('/api/ai-pair', enforceAIAccess, aiPairRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/collaboration', collaborationOverlayRoutes);
app.use('/api/collaboration', debugHandoffRoutes);
app.use('/api/collaboration', collabRealtimeRoutes);
app.use('/api/collaboration/design-sync', designSyncRoutes);
app.use('/api/code-editor', codeEditorRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/trial-billing', trialBillingRoutes);
app.use('/api/paystack-billing', paystackBillingRoutes);
app.use('/api/flutterwave-billing', flutterwaveBillingRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationsRoutes);

// Integration API routes (OAuth callbacks and public endpoints remain unprotected)
app.use('/api/github', githubApiRoutes);
app.use('/api/github-advanced', githubAdvancedRoutes);
app.use('/api/discord', discordApiRoutes);
app.use('/api/slack', slackApiRoutes);
app.use('/api/notion', notionApiRoutes);
app.use('/api/figma', figmaApiRoutes);
app.use('/api/lsp', lspRoutes);
app.use('/api/vfs', vfsRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/agent-confirmation', agentConfirmationRoutes);
// Project routes (enforcement of project limits handled in route handlers)
app.use('/api/projects', projectRoutes);
app.use('/api/ai-context', figmaContextRoutes, teamMemoryRoutes, ticketBridgeRoutes);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
    swaggerOptions: {
        url: '/api-docs/swagger.json',
        displayOperationId: true,
        defaultModelsExpandDepth: 1
    },
    customCss: `
        .topbar { background-color: #1f2937; }
        .info .title { color: #3b82f6; }
        .scheme-container { background-color: #f3f4f6; }
    `,
    customSiteTitle: 'CODEX INC API Documentation'
}));

// Swagger JSON endpoint
app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpecs);
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK',
        name: 'CODEX INC Backend',
        message: 'Enterprise AI Developer Platform API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        features: [
            'AI Pair Programming (Groq/Google Generative AI)',
            'Real-time Team Collaboration',
            'Multi-platform Integrations (GitHub, Discord, Slack, Notion, Figma)',
            'Enterprise Features (SOC 2, audit logs, RBAC)',
            'Support Ticketing & AI Agents',
            'Subscription Management (Stripe, Paystack, Flutterwave)',
            'Video Meetings & Real-time Chat'
        ],
        endpoints: {
            documentation: '/api-docs (Interactive Swagger UI)',
            health: '/api/health',
            auth: '/api/auth',
            subscription: '/api/subscription',
            integrations: '/api/integrations',
            aiPair: '/api/ai-pair',
            support: '/api/support',
            meetings: '/api/meetings',
            messaging: '/api/messaging',
            collaboration: '/api/collaboration'
        },
        quickStart: {
            apiDocs: 'GET /api-docs',
            signup: 'POST /api/auth/signup',
            signin: 'POST /api/auth/signin',
            getMe: 'GET /api/auth/me (requires token)'
        }
    });
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        status: 'OK',
        name: 'CODEX INC Backend API Documentation',
        version: '1.0.0',
        baseUrl: 'https://codex-backend-7utu.onrender.com',
        documentation: {
            fullDocs: 'See API_DOCUMENTATION.md in repository',
            sections: [
                'Authentication (/api/auth)',
                'User Management (/api/auth)',
                'AI Pair Programming (/api/ai-pair)',
                'Team Collaboration (/api/company, /api/messaging, /api/collaboration)',
                'Integrations (/api/integrations)',
                'Subscription & Billing (/api/subscription, /api/trial-billing, /api/paystack-billing)',
                'Support System (/api/support)',
                'Meetings (/api/meetings)',
                'Notifications (/api/notifications)'
            ]
        },
        mainEndpoints: {
            'POST /api/auth/signup': 'Create new user account',
            'POST /api/auth/signin': 'Login and get JWT token',
            'GET /api/auth/me': 'Get current user info',
            'GET /api/integrations': 'List user integrations',
            'POST /api/ai-pair/session': 'Create AI pair programming session',
            'POST /api/ai-pair/chat': 'Chat with AI assistant',
            'GET /api/subscription/current': 'Get subscription info',
            'POST /api/support/tickets': 'Create support ticket',
            'GET /api/health': 'Health check'
        },
        authentication: {
            method: 'Bearer Token (JWT)',
            header: 'Authorization: Bearer <token>',
            expiresIn: '24 hours'
        },
        rateLimiting: {
            free: '10 requests/minute',
            pro: '100 requests/minute',
            enterprise: 'Unlimited'
        },
        marketplace: {
            support: 'api-support@codexinc.com',
            status: 'https://status.codexinc.com'
        }
    });
});

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

// Export for programmatic control (tests)
const stopServer = async () => {
    try {
        const BillingCron = require('./utils/billingCron');
        if (BillingCron && BillingCron.stop) BillingCron.stop();

        const collaboration = require('./utils/collaborationService');
        if (collaboration && collaboration.stopPersistenceWorker) collaboration.stopPersistenceWorker();

        const terminalService = require('./utils/terminalService');
        if (terminalService && terminalService.stopCleanup) terminalService.stopCleanup();

        const sandboxProvisioner = require('./utils/sandboxProvisioner');
        if (sandboxProvisioner && sandboxProvisioner.stopAll) await sandboxProvisioner.stopAll();

        const agentOrchestrator = require('./utils/agentOrchestrator');
        if (agentOrchestrator && agentOrchestrator.stop) agentOrchestrator.stop();

        if (server) {
            await new Promise((resolve, reject) => {
                server.close(err => {
                    if (err) return reject(err);
                    server = null;
                    io = null;
                    resolve();
                });
            });
        }
    } catch (error) {
        console.error('Error during stopServer:', error);
    }
};

// Maintain backward compatibility: export `app` as module export, and attach helpers
app.createServer = createServer;
app.startServer = startServer;
app.stopServer = stopServer;
app.serverRef = () => server;

module.exports = app;

// Billing cron job is started after server starts listening
const BillingCron = require('./utils/billingCron');

// Socket.IO for real-time collaboration
const collaborationService = require('./utils/collaborationService');
const terminalService = require('./utils/terminalService');
const jwt = require('jsonwebtoken');

// Ensure io is initialized for module import (backwards compatibility)
createServer();

// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Authentication error'));
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id || decoded._id;
        socket.userId = userId;
        socket.user = { ...decoded, id: userId, userId };
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

    // Lightweight cursor presence (plain JSON, no Yjs required)
    socket.on('collab:cursor', ({ fileId, userId, userName, cursor }) => {
        try {
            socket.to(`file:${fileId}`).emit('collab:cursor-update', {
                userId: userId || socket.userId,
                userName: userName || 'Anonymous',
                cursor,
                ts: Date.now()
            });
        } catch (error) {
            console.error('Cursor broadcast error:', error);
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
    
    // Profile updated - broadcast to user's own room so all their tabs receive updates
    socket.on('profile-updated', ({ profileData }) => {
        socket.to(`user:${socket.userId}`).emit('profile-updated', {
            userId: socket.userId,
            ...profileData
        });
    });
    
    // Join workspace room for real-time file/folder updates
    socket.on('workspace:join', ({ workspaceId }) => {
        if (workspaceId) {
            socket.join(`workspace:${workspaceId}`);
            console.log(`User ${socket.userId} joined workspace: ${workspaceId}`);
        }
    });
    
    socket.on('workspace:leave', ({ workspaceId }) => {
        if (workspaceId) {
            socket.leave(`workspace:${workspaceId}`);
            console.log(`User ${socket.userId} left workspace: ${workspaceId}`);
        }
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
        const userId = decoded.userId || decoded.id || decoded._id;
        socket.userId = userId;
        socket.user = { ...decoded, id: userId, userId };
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

    // Relay workspace changes from main namespace to PTY sessions
    socket.on('workspace:change', async (payload) => {
        try {
            const { workspaceId, event, data } = payload;
            for (const [sessionId, terminal] of terminalService.terminals) {
                if (terminal.workspaceId === workspaceId && terminal.type === 'pty') {
                    await terminalService.applyPtyDelta(sessionId, event, data);
                }
            }
        } catch (error) {
            console.error('Terminal workspace change error:', error);
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

// ============================================================
// CRITICAL FIX: Start the HTTP server so it binds to a port.
// Without this, Render reports "No open ports detected" and
// the service never goes live.
// ============================================================
// Only auto-start when not in test mode (tests use supertest directly)
if (process.env.NODE_ENV !== 'test') {
    startServer(PORT)
        .then(() => {
            // Start billing cron job only after server is listening
            BillingCron.start();
        })
        .catch(err => {
            console.error('❌ Failed to start server:', err);
            process.exit(1);
        });
}
