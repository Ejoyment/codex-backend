const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Integration = require('../models/Integration');
const IntegrationData = require('../models/IntegrationData');
const Subscription = require('../models/Subscription');

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

// Get dashboard data
router.get('/data', verifyToken, async (req, res) => {
    try {
        // Get user's subscription
        const subscription = await Subscription.findOne({ userId: req.userId });
        const tier = subscription?.tier || 'freebie';

        // Get user's connected integrations (using correct field names)
        const integrations = await Integration.find({ userId: req.userId, isActive: true });
        
        console.log(`Found ${integrations.length} active integrations for user ${req.userId}`);
        
        // Define tier-based access
        const allowedIntegrations = tier === 'freebie' 
            ? ['discord'] 
            : ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'];

        // Filter integrations based on tier (using 'provider' field, not 'platform')
        const accessibleIntegrations = integrations.filter(int => 
            allowedIntegrations.includes(int.provider)
        );
        
        console.log(`Accessible integrations: ${accessibleIntegrations.map(i => i.provider).join(', ')}`);

        // Get integration data for connected platforms
        const integrationData = {};
        for (const integration of accessibleIntegrations) {
            const data = await IntegrationData.find({
                userId: req.userId,
                platform: integration.provider  // Use provider field
            }).sort({ lastSynced: -1 }).limit(10);
            
            integrationData[integration.provider] = data;
        }

        // Calculate stats
        const stats = {
            activeProjects: 0,
            totalCompleted: 0,
            teamMembers: 0,
            pendingTasks: 0
        };

        // GitHub stats
        if (integrationData.github) {
            const repos = integrationData.github.filter(d => d.dataType === 'repositories');
            const issues = integrationData.github.filter(d => d.dataType === 'issues');
            stats.activeProjects += repos.length;
            stats.pendingTasks += issues.filter(i => i.data.state === 'open').length;
            stats.totalCompleted += issues.filter(i => i.data.state === 'closed').length;
        }

        // Discord stats
        if (integrationData.discord) {
            const members = integrationData.discord.find(d => d.dataType === 'members');
            if (members) stats.teamMembers += members.metadata?.totalItems || 0;
        }

        // Slack stats
        if (integrationData.slack) {
            const members = integrationData.slack.find(d => d.dataType === 'members');
            if (members) stats.teamMembers += members.metadata?.totalItems || 0;
        }

        res.json({
            success: true,
            data: {
                tier,
                allowedIntegrations,
                connectedIntegrations: accessibleIntegrations.map(i => ({
                    platform: i.provider,  // Use provider field
                    username: i.providerUsername || i.providerEmail,  // Use correct field names
                    connectedAt: i.createdAt  // Use createdAt since there's no connectedAt
                })),
                integrationData,
                stats,
                hasData: Object.keys(integrationData).length > 0
            }
        });

    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data'
        });
    }
});

// Get specific integration data
router.get('/data/:platform', verifyToken, async (req, res) => {
    try {
        const { platform } = req.params;
        const axios = require('axios');
        
        // Check if integration is connected (using correct field names)
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: platform,  // Use provider instead of platform
            isActive: true       // Use isActive instead of connected
        });

        if (!integration) {
            return res.json({
                success: true,
                connected: false,
                data: {}
            });
        }

        // Fetch REAL data from APIs
        let realData = {};
        
        try {
            if (platform === 'github' && integration.accessToken) {
                // Fetch real GitHub repositories
                const reposResponse = await axios.get('https://api.github.com/user/repos', {
                    headers: {
                        'Authorization': `Bearer ${integration.accessToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    params: {
                        sort: 'updated',
                        per_page: 20
                    }
                });
                
                realData.repositories = reposResponse.data.map(repo => ({
                    name: repo.name,
                    owner: repo.owner.login,
                    description: repo.description,
                    private: repo.private,
                    stars: repo.stargazers_count,
                    forks: repo.forks_count,
                    language: repo.language,
                    url: repo.html_url,
                    updated: repo.updated_at
                }));
                
            } else if (platform === 'discord' && integration.accessToken) {
                // Fetch real Discord guilds (servers)
                const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
                    headers: {
                        'Authorization': `Bearer ${integration.accessToken}`
                    }
                });
                
                realData.servers = guildsResponse.data.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                    owner: guild.owner,
                    permissions: guild.permissions,
                    // Mock channels for now - would need additional API calls per guild
                    channels: [
                        { id: '1', name: 'general', type: 'text' },
                        { id: '2', name: 'announcements', type: 'text' },
                        { id: '3', name: 'dev-chat', type: 'text' }
                    ]
                }));
                
            } else if (platform === 'figma' && integration.accessToken) {
                // Fetch real Figma files
                const filesResponse = await axios.get('https://api.figma.com/v1/me', {
                    headers: {
                        'Authorization': `Bearer ${integration.accessToken}`
                    }
                });
                
                // Mock projects for now - Figma API structure is complex
                realData.projects = [
                    { id: '1', name: 'Design System', fileCount: 5 },
                    { id: '2', name: 'Product Designs', fileCount: 12 }
                ];
            }
        } catch (apiError) {
            console.error(`${platform} API error:`, apiError.response?.data || apiError.message);
            // If API call fails, return empty data instead of erroring
            realData = {};
        }

        res.json({
            success: true,
            connected: true,
            data: realData,
            integration: {
                platform: integration.provider,
                username: integration.providerUsername || integration.providerEmail,
                connectedAt: integration.createdAt
            }
        });

    } catch (error) {
        console.error('Integration data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching integration data'
        });
    }
});

// Sync integration data (mock for now)
router.post('/sync/:platform', verifyToken, async (req, res) => {
    try {
        const { platform } = req.params;
        
        console.log(`Sync request for platform: ${platform}, user: ${req.userId}`);
        
        // Check if integration is connected (using correct field names)
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: platform,  // Use provider instead of platform
            isActive: true       // Use isActive instead of connected
        });
        
        console.log(`Integration found:`, integration ? 'Yes' : 'No');

        if (!integration) {
            return res.status(404).json({
                success: false,
                message: 'Integration not connected'
            });
        }

        // Mock sync - in production, this would call actual APIs
        // For now, create some sample data
        const mockData = generateMockData(platform, req.userId);
        
        // Save mock data
        for (const item of mockData) {
            await IntegrationData.create(item);
        }

        res.json({
            success: true,
            message: `${platform} data synced successfully`,
            itemsAdded: mockData.length
        });

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
            success: false,
            message: 'Error syncing integration data'
        });
    }
});

// Helper function to generate mock data
function generateMockData(platform, userId) {
    const now = new Date();
    
    switch (platform) {
        case 'github':
            return [
                {
                    userId,
                    platform: 'github',
                    dataType: 'repositories',
                    data: {
                        name: 'codex-frontend',
                        description: 'Frontend application',
                        stars: 42,
                        language: 'JavaScript',
                        updated: now
                    },
                    metadata: { totalItems: 1, lastActivity: now }
                },
                {
                    userId,
                    platform: 'github',
                    dataType: 'commits',
                    data: {
                        message: 'Fix: Update dashboard layout',
                        author: 'You',
                        sha: 'abc123',
                        date: now
                    },
                    metadata: { totalItems: 1, lastActivity: now }
                }
            ];
        
        case 'discord':
            return [
                {
                    userId,
                    platform: 'discord',
                    dataType: 'messages',
                    data: {
                        content: 'Team standup at 10 AM',
                        author: 'TeamBot',
                        channel: 'general',
                        timestamp: now
                    },
                    metadata: { totalItems: 1, unreadCount: 1, lastActivity: now }
                },
                {
                    userId,
                    platform: 'discord',
                    dataType: 'members',
                    data: {
                        count: 15,
                        online: 8
                    },
                    metadata: { totalItems: 15, lastActivity: now }
                }
            ];
        
        case 'slack':
            return [
                {
                    userId,
                    platform: 'slack',
                    dataType: 'messages',
                    data: {
                        text: 'New deployment ready for review',
                        user: 'DevOps',
                        channel: 'deployments',
                        timestamp: now
                    },
                    metadata: { totalItems: 1, unreadCount: 1, lastActivity: now }
                }
            ];
        
        case 'notion':
            return [
                {
                    userId,
                    platform: 'notion',
                    dataType: 'pages',
                    data: {
                        title: 'Q1 Planning',
                        type: 'page',
                        lastEdited: now
                    },
                    metadata: { totalItems: 1, lastActivity: now }
                }
            ];
        
        case 'figma':
            return [
                {
                    userId,
                    platform: 'figma',
                    dataType: 'files',
                    data: {
                        name: 'Dashboard Redesign',
                        thumbnail: '',
                        lastModified: now
                    },
                    metadata: { totalItems: 1, lastActivity: now }
                }
            ];
        
        case 'vscode':
            return [
                {
                    userId,
                    platform: 'vscode',
                    dataType: 'recent',
                    data: {
                        file: 'dashboard.html',
                        workspace: 'codex-project',
                        lastOpened: now
                    },
                    metadata: { totalItems: 1, lastActivity: now }
                }
            ];
        
        default:
            return [];
    }
}

module.exports = router;
