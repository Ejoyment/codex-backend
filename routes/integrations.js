const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Integration = require('../models/Integration');
const axios = require('axios');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

/**
 * @swagger
 * /api/integrations:
 *   get:
 *     summary: List all user integrations
 *     tags:
 *       - Integrations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user integrations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 integrations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Integration'
 *       401:
 *         description: Unauthorized
 */
// Get all integrations for user
router.get('/', verifyToken, async (req, res) => {
    try {
        const integrations = await Integration.find({ userId: req.userId });
        
        // Don't send sensitive tokens to frontend
        const safeIntegrations = integrations.map(int => ({
            provider: int.provider,
            isActive: int.isActive,
            providerUsername: int.providerUsername,
            providerEmail: int.providerEmail,
            lastSyncedAt: int.lastSyncedAt,
            createdAt: int.createdAt
        }));

        res.json({
            success: true,
            integrations: safeIntegrations
        });
    } catch (error) {
        console.error('Get integrations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching integrations'
        });
    }
});

// GitHub OAuth
router.get('/github/auth', verifyToken, (req, res) => {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/github/callback`;
    const scope = 'repo,user,read:org';
    const state = req.userId; // Pass userId as state
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    
    res.json({
        success: true,
        authUrl: githubAuthUrl
    });
});

router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code
        }, {
            headers: { Accept: 'application/json' }
        });

        const accessToken = tokenResponse.data.access_token;

        // Get user info
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Save integration
        await Integration.findOneAndUpdate(
            { userId, provider: 'github' },
            {
                userId,
                provider: 'github',
                accessToken,
                providerUserId: userResponse.data.id.toString(),
                providerUsername: userResponse.data.login,
                providerEmail: userResponse.data.email,
                isActive: true,
                lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.redirect(`${process.env.FRONTEND_URL}/settings.html?success=github`);
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings.html?error=github`);
    }
});

// Slack OAuth
router.get('/slack/auth', verifyToken, (req, res) => {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/slack/callback`;
    const scope = 'channels:read,chat:write,users:read';
    const state = req.userId;
    
    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    
    res.json({
        success: true,
        authUrl: slackAuthUrl
    });
});

router.get('/slack/callback', async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    try {
        const tokenResponse = await axios.post('https://slack.com/api/oauth.v2.access', null, {
            params: {
                client_id: process.env.SLACK_CLIENT_ID,
                client_secret: process.env.SLACK_CLIENT_SECRET,
                code: code
            }
        });

        const data = tokenResponse.data;

        await Integration.findOneAndUpdate(
            { userId, provider: 'slack' },
            {
                userId,
                provider: 'slack',
                accessToken: data.access_token,
                providerUserId: data.team.id,
                providerUsername: data.team.name,
                isActive: true,
                lastSyncedAt: new Date(),
                metadata: {
                    workspace: data.team.name,
                    scope: data.scope
                }
            },
            { upsert: true, new: true }
        );

        res.redirect(`${process.env.FRONTEND_URL}/settings.html?success=slack`);
    } catch (error) {
        console.error('Slack OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings.html?error=slack`);
    }
});

// Discord OAuth
router.get('/discord/auth', verifyToken, (req, res) => {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/discord/callback`;
    const scope = 'identify email guilds';
    const state = req.userId;
    
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
    
    res.json({
        success: true,
        authUrl: discordAuthUrl
    });
});

router.get('/discord/callback', async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: `${process.env.BACKEND_URL}/api/integrations/discord/callback`
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const data = tokenResponse.data;

        // Get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });

        const user = userResponse.data;

        await Integration.findOneAndUpdate(
            { userId, provider: 'discord' },
            {
                userId,
                provider: 'discord',
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: new Date(Date.now() + data.expires_in * 1000),
                providerUserId: user.id,
                providerUsername: user.username,
                providerEmail: user.email,
                isActive: true,
                lastSyncedAt: new Date(),
                metadata: {
                    discriminator: user.discriminator,
                    avatar: user.avatar
                }
            },
            { upsert: true, new: true }
        );

        res.redirect(`${process.env.FRONTEND_URL}/settings.html?success=discord`);
    } catch (error) {
        console.error('Discord OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings.html?error=discord`);
    }
});

// Notion OAuth
router.get('/notion/auth', verifyToken, (req, res) => {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/notion/callback`;
    const state = req.userId;
    
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NOTION_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&owner=user&state=${state}`;
    
    res.json({
        success: true,
        authUrl: notionAuthUrl
    });
});

router.get('/notion/callback', async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    try {
        const auth = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64');
        
        const tokenResponse = await axios.post('https://api.notion.com/v1/oauth/token', {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: `${process.env.BACKEND_URL}/api/integrations/notion/callback`
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        const data = tokenResponse.data;

        await Integration.findOneAndUpdate(
            { userId, provider: 'notion' },
            {
                userId,
                provider: 'notion',
                accessToken: data.access_token,
                providerUserId: data.workspace_id,
                providerUsername: data.workspace_name,
                isActive: true,
                lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.redirect(`${process.env.FRONTEND_URL}/settings.html?success=notion`);
    } catch (error) {
        console.error('Notion OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings.html?error=notion`);
    }
});

// Figma OAuth
router.get('/figma/auth', verifyToken, (req, res) => {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/figma/callback`;
    const scope = 'file_read';
    const state = req.userId;
    
    const figmaAuthUrl = `https://www.figma.com/oauth?client_id=${process.env.FIGMA_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;
    
    res.json({
        success: true,
        authUrl: figmaAuthUrl
    });
});

router.get('/figma/callback', async (req, res) => {
    const { code, state } = req.query;
    const userId = state;

    try {
        const tokenResponse = await axios.post('https://www.figma.com/api/oauth/token', {
            client_id: process.env.FIGMA_CLIENT_ID,
            client_secret: process.env.FIGMA_CLIENT_SECRET,
            redirect_uri: `${process.env.BACKEND_URL}/api/integrations/figma/callback`,
            code: code,
            grant_type: 'authorization_code'
        });

        const data = tokenResponse.data;

        // Get user info
        const userResponse = await axios.get('https://api.figma.com/v1/me', {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });

        await Integration.findOneAndUpdate(
            { userId, provider: 'figma' },
            {
                userId,
                provider: 'figma',
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: new Date(Date.now() + data.expires_in * 1000),
                providerUserId: userResponse.data.id,
                providerUsername: userResponse.data.handle,
                providerEmail: userResponse.data.email,
                isActive: true,
                lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.redirect(`${process.env.FRONTEND_URL}/settings.html?success=figma`);
    } catch (error) {
        console.error('Figma OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings.html?error=figma`);
    }
});

// VS Code - Generate access token
router.post('/vscode/connect', verifyToken, async (req, res) => {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Access token required'
            });
        }

        await Integration.findOneAndUpdate(
            { userId: req.userId, provider: 'vscode' },
            {
                userId: req.userId,
                provider: 'vscode',
                accessToken: accessToken,
                isActive: true,
                lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            message: 'VS Code connected successfully'
        });
    } catch (error) {
        console.error('VS Code connection error:', error);
        res.status(500).json({
            success: false,
            message: 'Error connecting VS Code'
        });
    }
});

// Disconnect integration
router.delete('/:provider/disconnect', verifyToken, async (req, res) => {
    try {
        const { provider } = req.params;

        await Integration.findOneAndDelete({
            userId: req.userId,
            provider: provider
        });

        res.json({
            success: true,
            message: `${provider} disconnected successfully`
        });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            message: 'Error disconnecting integration'
        });
    }
});

module.exports = router;
