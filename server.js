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

const app = express();

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

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai-pair', aiPairRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/collaboration', collaborationRoutes);

// Integration API routes
app.use('/api/github', githubApiRoutes);
app.use('/api/discord', discordApiRoutes);
app.use('/api/slack', slackApiRoutes);
app.use('/api/notion', notionApiRoutes);
app.use('/api/figma', figmaApiRoutes);

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
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📧 Email service: ${process.env.EMAIL_HOST}`);
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
    console.log(`  POST   /api/auth/complete-onboarding`);
    console.log(`  GET    /api/subscription/current`);
    console.log(`  POST   /api/subscription/create-checkout`);
    console.log(`  POST   /api/subscription/upgrade`);
    console.log(`  POST   /api/subscription/cancel`);
    console.log(`  POST   /api/subscription/portal`);
    console.log(`  POST   /api/subscription/webhook/stripe`);
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
