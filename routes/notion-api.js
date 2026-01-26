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

module.exports = router;
