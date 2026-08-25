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

async function getNotionIntegration(userId) {
    const integration = await Integration.findOne({ userId, provider: 'notion', isActive: true });
    if (!integration) throw new Error('Notion not connected');
    return integration;
}

async function notionAPI(accessToken, endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            method,
            url: `https://api.notion.com/v1${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            data
        });
        return response.data;
    } catch (error) {
        console.error('Notion API error:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * @swagger
 * /api/notion/search:
 *   post:
 *     summary: Search Notion workspace
 *     tags:
 *       - Notion API
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query text
 *               filter:
 *                 type: object
 *                 description: Filter criteria
 *               sort:
 *                 type: object
 *                 description: Sort criteria
 *               page_size:
 *                 type: integer
 *                 default: 100
 *                 description: Number of results per page
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
// Search
router.post('/search', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { query, filter, sort, page_size = 100 } = req.body;
        const results = await notionAPI(integration.accessToken, '/search', 'POST', { query, filter, sort, page_size });
        res.json({ success: true, results: results.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get databases
router.get('/databases', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const results = await notionAPI(integration.accessToken, '/search', 'POST', {
            filter: { property: 'object', value: 'database' },
            page_size: 100
        });
        res.json({ success: true, databases: results.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get database
router.get('/databases/:databaseId', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const database = await notionAPI(integration.accessToken, `/databases/${req.params.databaseId}`);
        res.json({ success: true, database });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Query database
router.post('/databases/:databaseId/query', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { filter, sorts, page_size = 100 } = req.body;
        const results = await notionAPI(integration.accessToken, `/databases/${req.params.databaseId}/query`, 'POST', { filter, sorts, page_size });
        res.json({ success: true, results: results.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get page
router.get('/pages/:pageId', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const page = await notionAPI(integration.accessToken, `/pages/${req.params.pageId}`);
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create page
router.post('/pages', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { parent, properties, children } = req.body;
        const page = await notionAPI(integration.accessToken, '/pages', 'POST', { parent, properties, children });
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update page
router.patch('/pages/:pageId', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { properties } = req.body;
        const page = await notionAPI(integration.accessToken, `/pages/${req.params.pageId}`, 'PATCH', { properties });
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get block children
router.get('/blocks/:blockId/children', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { page_size = 100 } = req.query;
        const blocks = await notionAPI(integration.accessToken, `/blocks/${req.params.blockId}/children?page_size=${page_size}`);
        res.json({ success: true, blocks: blocks.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Append block children
router.patch('/blocks/:blockId/children', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { children } = req.body;
        const result = await notionAPI(integration.accessToken, `/blocks/${req.params.blockId}/children`, 'PATCH', { children });
        res.json({ success: true, blocks: result.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get user
router.get('/users/:userId', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const user = await notionAPI(integration.accessToken, `/users/${req.params.userId}`);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// List all users
router.get('/users', verifyToken, async (req, res) => {
    try {
        const integration = await getNotionIntegration(req.userId);
        const { page_size = 100 } = req.query;
        const users = await notionAPI(integration.accessToken, `/users?page_size=${page_size}`);
        res.json({ success: true, users: users.results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== OAUTH / CONFIGURATION =====

/**
 * @swagger
 * /api/notion/connect:
 *   get:
 *     summary: Start Notion OAuth flow
 *     tags:
 *       - Notion API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns Notion authorization URL
 *       401:
 *         description: Unauthorized
 */
router.get('/connect', verifyToken, (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.NOTION_CLIENT_ID,
        redirect_uri: process.env.NOTION_CALLBACK_URL,
        response_type: 'code',
        owner: 'user',
        state: req.userId // pass userId through so callback knows who's connecting
    });

    const authUrl = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;

    res.json({
        success: true,
        authUrl
    });
});

/**
 * @swagger
 * /api/notion/callback:
 *   get:
 *     summary: Notion OAuth callback
 *     tags:
 *       - Notion API
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
 *         description: Notion connected successfully
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

        // Notion requires Basic Auth (client_id:client_secret base64-encoded) for token exchange
        const basicAuth = Buffer.from(
            `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
        ).toString('base64');

        const tokenResponse = await axios.post(
            'https://api.notion.com/v1/oauth/token',
            {
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.NOTION_CALLBACK_URL
            },
            {
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = tokenResponse.data;

        if (!data.access_token) {
            return res.status(500).json({ success: false, message: 'Token exchange failed' });
        }

        // Notion's token response includes workspace + bot info directly — no extra API call needed
        await Integration.findOneAndUpdate(
            { userId, provider: 'notion' },
            {
                userId,
                provider: 'notion',
                accessToken: data.access_token,
                isActive: true,
                workspaceId: data.workspace_id,
                workspaceName: data.workspace_name,
                connectedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // Redirect back to your frontend settings page
        res.redirect(`${process.env.FRONTEND_URL}/integrations?notion=connected`);
    } catch (error) {
        console.error('Notion OAuth callback error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Notion connection failed' });
    }
});

/**
 * @swagger
 * /api/notion/status:
 *   get:
 *     summary: Check Notion connection status
 *     tags:
 *       - Notion API
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
            provider: 'notion',
            isActive: true
        });

        res.json({
            success: true,
            connected: !!integration,
            workspace: integration ? integration.workspaceName : null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/notion/disconnect:
 *   delete:
 *     summary: Disconnect Notion integration
 *     tags:
 *       - Notion API
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
            { userId: req.userId, provider: 'notion' },
            { isActive: false }
        );

        res.json({ success: true, message: 'Notion disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
