const express = require('express');
const router = express.Router();
const axios = require('axios');
const Integration = require('../models/Integration');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Helper to get Discord integration
async function getDiscordIntegration(userId) {
    const integration = await Integration.findOne({
        userId,
        provider: 'discord',
        isActive: true
    });
    
    if (!integration) {
        throw new Error('Discord not connected');
    }
    
    // Check if token expired
    if (integration.expiresAt && new Date() > integration.expiresAt) {
        // Refresh token
        try {
            const refreshed = await refreshDiscordToken(integration);
            return refreshed;
        } catch (error) {
            throw new Error('Discord token expired. Please reconnect.');
        }
    }
    
    return integration;
}

// Refresh Discord token
async function refreshDiscordToken(integration) {
    try {
        const response = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: integration.refreshToken
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        
        const data = response.data;
        
        // Update integration with new tokens
        integration.accessToken = data.access_token;
        integration.refreshToken = data.refresh_token;
        integration.expiresAt = new Date(Date.now() + data.expires_in * 1000);
        await integration.save();
        
        return integration;
    } catch (error) {
        console.error('Discord token refresh error:', error);
        throw error;
    }
}

// Helper to make Discord API calls
async function discordAPI(accessToken, endpoint, method = 'GET', data = null) {
    try {
        const response = await axios({
            method,
            url: `https://discord.com/api/v10${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data
        });
        return response.data;
    } catch (error) {
        console.error('Discord API error:', error.response?.data || error.message);
        throw error;
    }
}

// ===== USER INFO =====

// Get current user
router.get('/user', verifyToken, async (req, res) => {
    try {
        const integration = await getDiscordIntegration(req.userId);
        const user = await discordAPI(integration.accessToken, '/users/@me');
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
                email: user.email,
                verified: user.verified,
                locale: user.locale,
                mfaEnabled: user.mfa_enabled
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== GUILDS (SERVERS) =====

// Get user's guilds
router.get('/guilds', verifyToken, async (req, res) => {
    try {
        const integration = await getDiscordIntegration(req.userId);
        const guilds = await discordAPI(integration.accessToken, '/users/@me/guilds');
        
        res.json({
            success: true,
            guilds: guilds.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                owner: guild.owner,
                permissions: guild.permissions,
                features: guild.features
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get guild details (requires bot token - for future implementation)
router.get('/guilds/:guildId', verifyToken, async (req, res) => {
    try {
        // Note: This requires bot token with proper permissions
        // For now, return basic info from user's guilds
        const integration = await getDiscordIntegration(req.userId);
        const guilds = await discordAPI(integration.accessToken, '/users/@me/guilds');
        const guild = guilds.find(g => g.id === req.params.guildId);
        
        if (!guild) {
            return res.status(404).json({ success: false, message: 'Guild not found' });
        }
        
        res.json({
            success: true,
            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                owner: guild.owner,
                permissions: guild.permissions
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== CHANNELS =====

// Get guild channels (requires bot - mock for now)
router.get('/guilds/:guildId/channels', verifyToken, async (req, res) => {
    try {
        await getDiscordIntegration(req.userId);
        
        // Mock channels - in production, you'd need a bot with proper permissions
        const mockChannels = [
            { id: '1', name: 'general', type: 0, position: 0 },
            { id: '2', name: 'announcements', type: 0, position: 1 },
            { id: '3', name: 'dev-chat', type: 0, position: 2 },
            { id: '4', name: 'Voice Channel', type: 2, position: 3 }
        ];
        
        res.json({
            success: true,
            channels: mockChannels,
            note: 'Full channel access requires Discord bot integration'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== MESSAGES =====

// Get channel messages (requires bot - mock for now)
router.get('/channels/:channelId/messages', verifyToken, async (req, res) => {
    try {
        await getDiscordIntegration(req.userId);
        const { limit = 50 } = req.query;
        
        // Mock messages - in production, requires bot token
        const mockMessages = [
            {
                id: '1',
                content: 'Welcome to the channel!',
                author: {
                    id: '123',
                    username: 'ServerBot',
                    avatar: null
                },
                timestamp: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: '2',
                content: 'Hey everyone! How\'s the project going?',
                author: {
                    id: '456',
                    username: 'TeamMember',
                    avatar: null
                },
                timestamp: new Date(Date.now() - 1800000).toISOString()
            }
        ];
        
        res.json({
            success: true,
            messages: mockMessages.slice(0, limit),
            note: 'Full message access requires Discord bot integration'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send message (requires bot - mock for now)
router.post('/channels/:channelId/messages', verifyToken, async (req, res) => {
    try {
        await getDiscordIntegration(req.userId);
        const { content, embeds } = req.body;
        
        // Mock response - in production, requires bot token with MESSAGE_SEND permission
        res.json({
            success: true,
            message: {
                id: Date.now().toString(),
                content,
                timestamp: new Date().toISOString()
            },
            note: 'Sending messages requires Discord bot integration. Please set up a bot for full functionality.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== WEBHOOKS =====

// Create webhook
router.post('/channels/:channelId/webhooks', verifyToken, async (req, res) => {
    try {
        await getDiscordIntegration(req.userId);
        const { name, avatar } = req.body;
        
        // Mock response - requires bot or proper channel permissions
        res.json({
            success: true,
            webhook: {
                id: Date.now().toString(),
                name,
                url: 'https://discord.com/api/webhooks/...',
                token: 'webhook_token_here'
            },
            note: 'Creating webhooks requires proper channel permissions'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== CONNECTIONS =====

// Get user connections
router.get('/connections', verifyToken, async (req, res) => {
    try {
        const integration = await getDiscordIntegration(req.userId);
        const connections = await discordAPI(integration.accessToken, '/users/@me/connections');
        
        res.json({
            success: true,
            connections: connections.map(conn => ({
                id: conn.id,
                name: conn.name,
                type: conn.type,
                verified: conn.verified,
                visible: conn.visibility === 1
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== BOT SETUP GUIDE =====

// Get bot setup instructions
router.get('/bot-setup', verifyToken, async (req, res) => {
    res.json({
        success: true,
        message: 'Discord Bot Setup Guide',
        steps: [
            {
                step: 1,
                title: 'Create Discord Application',
                description: 'Go to https://discord.com/developers/applications',
                action: 'Click "New Application" and give it a name'
            },
            {
                step: 2,
                title: 'Create Bot',
                description: 'In your application, go to the "Bot" section',
                action: 'Click "Add Bot" and confirm'
            },
            {
                step: 3,
                title: 'Get Bot Token',
                description: 'In the Bot section, click "Reset Token"',
                action: 'Copy the token and add it to your .env file as DISCORD_BOT_TOKEN'
            },
            {
                step: 4,
                title: 'Enable Intents',
                description: 'Scroll down to "Privileged Gateway Intents"',
                action: 'Enable: Server Members Intent, Message Content Intent'
            },
            {
                step: 5,
                title: 'Invite Bot to Server',
                description: 'Go to OAuth2 > URL Generator',
                action: 'Select scopes: bot, applications.commands. Select permissions: Send Messages, Read Messages, Manage Webhooks'
            },
            {
                step: 6,
                title: 'Copy Invite URL',
                description: 'Copy the generated URL at the bottom',
                action: 'Open the URL in browser and select your server'
            }
        ],
        requiredPermissions: [
            'View Channels',
            'Send Messages',
            'Read Message History',
            'Manage Webhooks',
            'Embed Links'
        ],
        envVariables: {
            DISCORD_BOT_TOKEN: 'Your bot token from step 3',
            DISCORD_CLIENT_ID: 'Your application ID',
            DISCORD_CLIENT_SECRET: 'Your client secret'
        }
    });
});

module.exports = router;
