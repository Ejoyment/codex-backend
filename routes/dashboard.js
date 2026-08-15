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
        const userId = decoded.userId || decoded.id || decoded._id;
        req.userId = userId;
        req.user = { ...decoded, id: userId, userId };
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
 * /api/dashboard/data:
 *   get:
 *     summary: Get dashboard overview data
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     description: Returns integration data, stats, and connected platforms for the current user
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tier:
 *                       type: string
 *                     connectedIntegrations:
 *                       type: array
 *                     stats:
 *                       type: object
 *       401:
 *         description: Unauthorized
 */
// Get dashboard data
router.get('/data', verifyToken, async (req, res) => {
    try {
        // Get user's subscription
        const subscription = await Subscription.findOne({ userId: req.userId });
        const tier = subscription?.tier || 'starter';
        const status = subscription?.status || 'trial';

        // Get user's connected integrations
        const integrations = await Integration.find({ userId: req.userId, isActive: true });
        
        console.log(`Found ${integrations.length} active integrations for user ${req.userId}`);
        
        // Define which integrations each tier can access
        const allowedIntegrationsMap = {
            'starter': ['discord'],
            'freebie': ['discord'],
            'professional': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
            'enterprise': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode']
        };
        const allowedIntegrations = allowedIntegrationsMap[tier] || ['discord'];

        // Get all integrations the user has connected (regardless of tier)
        const allUserIntegrations = await Integration.find({ userId: req.userId });
        const connectedUserPlatforms = allUserIntegrations
            .filter(i => i.isActive)
            .map(i => i.provider);

        // Build integration hub data with both connected and tierAllowed flags
        const hubs = [
            { platform: 'github', name: 'GitHub' },
            { platform: 'discord', name: 'Discord' },
            { platform: 'slack', name: 'Slack' },
            { platform: 'notion', name: 'Notion' },
            { platform: 'figma', name: 'Figma' },
            { platform: 'vscode', name: 'VS Code' }
        ].map(hub => ({
            ...hub,
            connected: connectedUserPlatforms.includes(hub.platform),
            tierAllowed: allowedIntegrations.includes(hub.platform)
        }));

        // Get integration data for connected platforms
        const integrationData = {};
        for (const integration of integrations) {
            const data = await IntegrationData.find({
                userId: req.userId,
                platform: integration.provider
            }).sort({ lastSynced: -1 }).limit(10);
            
            integrationData[integration.provider] = data;
        }

        // ===== REAL Stats from Local Models =====
        const LocalProject = require('../models/LocalProject');
        const LocalTask = require('../models/LocalTask');
        const Company = require('../models/Company');
        const TeamProject = require('../models/TeamProject');
        const TeamTask = require('../models/TeamTask');

        // Count local projects
        const localProjectCount = await LocalProject.countDocuments({ 
            userId: req.userId, 
            isArchived: false 
        });
        
        const localCompletedTasks = await LocalTask.countDocuments({
            userId: req.userId,
            status: 'completed'
        });
        const localPendingTasks = await LocalTask.countDocuments({
            userId: req.userId,
            status: { $in: ['pending', 'in-progress', 'in_review'] }
        });

        // Count GitHub repos as projects
        const githubRepos = integrationData.github?.filter(d => d.dataType === 'repositories') || [];
        const githubIssues = integrationData.github?.filter(d => d.dataType === 'issues') || [];
        const githubCompleted = githubIssues.filter(i => i.data.state === 'closed').length;
        const githubPending = githubIssues.filter(i => i.data.state === 'open').length;

        // Team projects/tasks (if user is in companies)
        let teamProjectCount = 0;
        let teamCompletedTasks = 0;
        let teamMembersCount = 0;

        try {
            const userCompanies = await Company.find({
                $or: [
                    { 'members.userId': req.userId },
                    { owner: req.userId }
                ]
            });
            
            teamMembersCount = userCompanies.reduce((sum, c) => sum + (c.members?.length || 0), 0);
            
            for (const company of userCompanies) {
                const teamProjects = await TeamProject.countDocuments({ companyId: company._id });
                const completedTeamTasks = await TeamTask.countDocuments({ 
                    companyId: company._id, 
                    status: 'completed' 
                });
                teamProjectCount += teamProjects;
                teamCompletedTasks += completedTeamTasks;
            }
        } catch (companyError) {
            console.error('Company stats error:', companyError);
        }

        const stats = {
            activeProjects: localProjectCount + githubRepos.length + teamProjectCount,
            totalCompleted: localCompletedTasks + githubCompleted + teamCompletedTasks,
            completedTasks: localCompletedTasks + githubCompleted + teamCompletedTasks,
            teamMembers: teamMembersCount,
            pendingTasks: localPendingTasks + githubPending,
            integrations: connectedUserPlatforms.length,
            activeProjectsCount: localProjectCount + githubRepos.length + teamProjectCount,
            totalCompletedCount: localCompletedTasks + githubCompleted + teamCompletedTasks,
            teamMembersCount,
            pendingTasksCount: localPendingTasks + githubPending,
            integrationsCount: connectedUserPlatforms.length,
            localProjects: localProjectCount,
            githubProjects: githubRepos.length,
            teamProjects: teamProjectCount
        };

        // Trial info for dashboard banner
        let trialInfo = null;
        if (subscription && subscription.status === 'trial') {
            const daysLeft = subscription.getTrialDaysLeft();
            trialInfo = {
                isOnTrial: true,
                daysLeft,
                isLastDay: subscription.isLastTrialDay(),
                trialEndsAt: subscription.trialEndsAt
            };
        }

        res.json({
            success: true,
            data: {
                tier,
                status,
                allowedIntegrations,
                integrationsHub: hubs,
                connectedIntegrations: connectedUserPlatforms.map(p => ({
                    platform: p,
                    username: integrations.find(i => i.provider === p)?.providerUsername || null,
                    connectedAt: integrations.find(i => i.provider === p)?.createdAt || null
                })),
                integrationData,
                stats,
                trial: trialInfo,
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

/**
 * @swagger
 * /api/dashboard/data/{platform}:
 *   get:
 *     summary: Get data for a specific integration platform
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: platform
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [github, discord, slack, notion, figma, vscode]
 *         example: github
 *     responses:
 *       200:
 *         description: Platform integration data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 connected:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/dashboard/sync/{platform}:
 *   post:
 *     summary: Sync data for a specific integration platform
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: platform
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [github, discord, slack, notion, figma, vscode]
 *         example: github
 *     responses:
 *       200:
 *         description: Platform data synced successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Integration not connected
 */
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
