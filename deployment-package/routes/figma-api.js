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

async function getFigmaIntegration(userId) {
    const integration = await Integration.findOne({ userId, provider: 'figma', isActive: true });
    if (!integration) throw new Error('Figma not connected');
    
    // Check if token expired
    if (integration.expiresAt && new Date() > integration.expiresAt) {
        try {
            const refreshed = await refreshFigmaToken(integration);
            return refreshed;
        } catch (error) {
            throw new Error('Figma token expired. Please reconnect.');
        }
    }
    
    return integration;
}

async function refreshFigmaToken(integration) {
    try {
        const response = await axios.post('https://www.figma.com/api/oauth/refresh', {
            client_id: process.env.FIGMA_CLIENT_ID,
            client_secret: process.env.FIGMA_CLIENT_SECRET,
            refresh_token: integration.refreshToken
        });
        
        const data = response.data;
        integration.accessToken = data.access_token;
        integration.expiresAt = new Date(Date.now() + data.expires_in * 1000);
        await integration.save();
        
        return integration;
    } catch (error) {
        console.error('Figma token refresh error:', error);
        throw error;
    }
}

async function figmaAPI(accessToken, endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            method,
            url: `https://api.figma.com/v1${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data
        });
        return response.data;
    } catch (error) {
        console.error('Figma API error:', error.response?.data || error.message);
        throw error;
    }
}

// Get current user
router.get('/me', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const user = await figmaAPI(integration.accessToken, '/me');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get user's files
router.get('/files', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        
        // Get user's teams first
        const user = await figmaAPI(integration.accessToken, '/me');
        const teamId = user.teams?.[0]?.id;
        
        if (!teamId) {
            return res.json({ success: true, files: [], message: 'No teams found' });
        }
        
        // Get team projects
        const projects = await figmaAPI(integration.accessToken, `/teams/${teamId}/projects`);
        
        // Get files from first project
        const projectId = projects.projects?.[0]?.id;
        if (!projectId) {
            return res.json({ success: true, files: [], message: 'No projects found' });
        }
        
        const files = await figmaAPI(integration.accessToken, `/projects/${projectId}/files`);
        res.json({ success: true, files: files.files });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file
router.get('/files/:fileKey', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { geometry = 'paths' } = req.query;
        
        const file = await figmaAPI(integration.accessToken, `/files/${fileKey}?geometry=${geometry}`);
        res.json({ success: true, file });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file nodes
router.get('/files/:fileKey/nodes', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { ids } = req.query; // Comma-separated node IDs
        
        const nodes = await figmaAPI(integration.accessToken, `/files/${fileKey}/nodes?ids=${ids}`);
        res.json({ success: true, nodes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file images
router.get('/images/:fileKey', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { ids, scale = 1, format = 'png' } = req.query;
        
        const images = await figmaAPI(integration.accessToken, `/images/${fileKey}?ids=${ids}&scale=${scale}&format=${format}`);
        res.json({ success: true, images });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file versions
router.get('/files/:fileKey/versions', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        
        const versions = await figmaAPI(integration.accessToken, `/files/${fileKey}/versions`);
        res.json({ success: true, versions: versions.versions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get file comments
router.get('/files/:fileKey/comments', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        
        const comments = await figmaAPI(integration.accessToken, `/files/${fileKey}/comments`);
        res.json({ success: true, comments: comments.comments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Post comment
router.post('/files/:fileKey/comments', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { fileKey } = req.params;
        const { message, client_meta } = req.body;
        
        const comment = await figmaAPI(integration.accessToken, `/files/${fileKey}/comments`, 'POST', { message, client_meta });
        res.json({ success: true, comment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get team projects
router.get('/teams/:teamId/projects', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { teamId } = req.params;
        
        const projects = await figmaAPI(integration.accessToken, `/teams/${teamId}/projects`);
        res.json({ success: true, projects: projects.projects });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get project files
router.get('/projects/:projectId/files', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { projectId } = req.params;
        
        const files = await figmaAPI(integration.accessToken, `/projects/${projectId}/files`);
        res.json({ success: true, files: files.files });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get component
router.get('/components/:key', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const component = await figmaAPI(integration.accessToken, `/components/${key}`);
        res.json({ success: true, component: component.meta });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get component sets
router.get('/component_sets/:key', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const componentSet = await figmaAPI(integration.accessToken, `/component_sets/${key}`);
        res.json({ success: true, componentSet: componentSet.meta });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get styles
router.get('/styles/:key', verifyToken, async (req, res) => {
    try {
        const integration = await getFigmaIntegration(req.userId);
        const { key } = req.params;
        
        const style = await figmaAPI(integration.accessToken, `/styles/${key}`);
        res.json({ success: true, style: style.meta });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
