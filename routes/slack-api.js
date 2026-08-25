const express = require('express');
const router = express.Router();
const axios = require('axios');
const Integration = require('../models/Integration');
const jwt = require('jsonwebtoken');

// Middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

async function getSlackIntegration(userId) {
    const integration = await Integration.findOne({ userId, provider: 'slack', isActive: true });
    if (!integration) throw new Error('Slack not connected');
    return integration;
}

async function slackAPI(accessToken, method, params = {}) {
    try {
        const response = await axios.post(`https://slack.com/api/${method}`, params, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
        if (!response.data.ok) {
            throw new Error(response.data.error || 'Slack API error');
        }
        return response.data;
    } catch (error) {
        console.error('Slack API error:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * @swagger
 * /api/slack/team/info:
 *   get:
 *     summary: Get Slack workspace information
 *     tags:
 *       - Slack API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Slack workspace information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 team:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     domain:
 *                       type: string
 *                     email_domain:
 *                       type: string
 *                     icon:
 *                       type: object
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
// Get workspace info
router.get('/team/info', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const team = await slackAPI(integration.accessToken, 'team.info');
        res.json({ success: true, team: team.team });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get channels
router.get('/conversations/list', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { types = 'public_channel,private_channel', limit = 100 } = req.query;
        const channels = await slackAPI(integration.accessToken, 'conversations.list', { types, limit });
        res.json({ success: true, channels: channels.channels });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get channel history
router.get('/conversations/history/:channelId', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { channelId } = req.params;
        const { limit = 50 } = req.query;
        const history = await slackAPI(integration.accessToken, 'conversations.history', { channel: channelId, limit });
        res.json({ success: true, messages: history.messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send message
router.post('/chat/postMessage', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { channel, text, blocks } = req.body;
        const result = await slackAPI(integration.accessToken, 'chat.postMessage', { channel, text, blocks });
        res.json({ success: true, message: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get users
router.get('/users/list', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { limit = 100 } = req.query;
        const users = await slackAPI(integration.accessToken, 'users.list', { limit });
        res.json({ success: true, users: users.members });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get user info
router.get('/users/info/:userId', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const user = await slackAPI(integration.accessToken, 'users.info', { user: req.params.userId });
        res.json({ success: true, user: user.user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create channel
router.post('/conversations/create', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { name, is_private = false } = req.body;
        const channel = await slackAPI(integration.accessToken, 'conversations.create', { name, is_private });
        res.json({ success: true, channel: channel.channel });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upload file
router.post('/files/upload', verifyToken, async (req, res) => {
    try {
        const integration = await getSlackIntegration(req.userId);
        const { channels, content, filename, title } = req.body;
        const file = await slackAPI(integration.accessToken, 'files.upload', { channels, content, filename, title });
        res.json({ success: true, file: file.file });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== OAUTH / CONFIGURATION =====

/**
 * @swagger
 * /api/slack/connect:
 *   get:
 *     summary: Start Slack OAuth flow
 *     tags:
 *       - Slack API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns Slack authorization URL
 *       401:
 *         description: Unauthorized
 */
router.get('/connect', verifyToken, (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        redirect_uri: process.env.SLACK_CALLBACK_URL,
        scope: 'channels:read,channels:history,chat:write,users:read,groups:read,groups:history,files:write',
        state: req.userId // pass userId through so callback knows who's connecting
    });

    const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

    res.json({
        success: true,
        authUrl
    });
});

/**
 * @swagger
 * /api/slack/callback:
 *   get:
 *     summary: Slack OAuth callback
 *     tags:
 *       - Slack API
 *     parameters:
 *       - name: code
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Slack connected successfully
 *       400:
 *         description: Missing code or state
 *       500:
 *         description: OAuth exchange failed
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state: userId } = req.query;

        if (!code || !userId) {
            return res.status(400).json({ success: false, message: 'Missing code or state' });
        }

        // Exchange code for access token
        const tokenResponse = await axios.post(
            'https://slack.com/api/oauth.v2.access',
            new URLSearchParams({
                client_id: process.env.SLACK_CLIENT_ID,
                client_secret: process.env.SLACK_CLIENT_SECRET,
                code,
                redirect_uri: process.env.SLACK_CALLBACK_URL
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const data = tokenResponse.data;

        if (!data.ok) {
            return res.status(500).json({ success: false, message: data.error || 'Token exchange failed' });
        }

        // Slack returns the bot token at data.access_token,
        // and (if user scopes were requested) the user token at data.authed_user.access_token
        await Integration.findOneAndUpdate(
            { userId, provider: 'slack' },
            {
                userId,
                provider: 'slack',
                accessToken: data.access_token,
                isActive: true,
                teamId: data.team?.id,
                teamName: data.team?.name,
                connectedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // Redirect back to your frontend settings page
        res.redirect(`${process.env.FRONTEND_URL}/integrations?slack=connected`);
    } catch (error) {
        console.error('Slack OAuth callback error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Slack connection failed' });
    }
});

/**
 * @swagger
 * /api/slack/status:
 *   get:
 *     summary: Check Slack connection status
 *     tags:
 *       - Slack API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status
 *       401:
 *         description: Unauthorized
 */
router.get('/status', verifyToken, async (req, res) => {
    try {
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: 'slack',
            isActive: true
        });

        res.json({
            success: true,
            connected: !!integration,
            team: integration ? integration.teamName : null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/slack/disconnect:
 *   delete:
 *     summary: Disconnect Slack integration
 *     tags:
 *       - Slack API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/disconnect', verifyToken, async (req, res) => {
    try {
        await Integration.findOneAndUpdate(
            { userId: req.userId, provider: 'slack' },
            { isActive: false }
        );

        res.json({ success: true, message: 'Slack disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
