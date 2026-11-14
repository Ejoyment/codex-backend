const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Integration = require('../models/Integration');
const IntegrationData = require('../models/IntegrationData');
const Subscription = require('../models/Subscription');
const { authenticateToken } = require('../middleware/auth');
const { canonicalTier } = require('../utils/tierNames');
const providerSync = require('../utils/providerSync');
const { sendError, sendInternalError } = require('../utils/httpErrors');

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
router.get('/data', authenticateToken, async (req, res) => {
    try {
        // Get user's subscription
        const subscription = await Subscription.findOne({ userId: req.userId });
        const tier = canonicalTier(subscription?.tier);
        const status = subscription?.status || 'trial';

        // Load integrations once; active ones drive the connected-platform view.
        const allUserIntegrations = await Integration.find({ userId: req.userId });
        const integrations = allUserIntegrations.filter(i => i.isActive);

        console.log(`Found ${integrations.length} active integrations for user ${req.userId}`);
        
        // Define which integrations each tier can access
        const allowedIntegrationsMap = {
            'developer': ['discord'],
            'pro': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
            'pro_plus': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
            'team_standard': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
            'team_premium': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
            'enterprise': ['github', 'discord', 'slack', 'notion', 'figma', 'vscode']
        };
        const allowedIntegrations = allowedIntegrationsMap[tier] || ['discord'];

        // Get all integrations the user has connected (regardless of tier)
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

        // Join each active integration to its ten most recently synced records.
        const integrationDataRows = await Integration.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.userId), isActive: true } },
            {
                $lookup: {
                    from: IntegrationData.collection.name,
                    let: { integrationUserId: '$userId', platform: '$provider' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$userId', '$$integrationUserId'] },
                                        { $eq: ['$platform', '$$platform'] }
                                    ]
                                }
                            }
                        },
                        { $sort: { lastSynced: -1 } },
                        { $limit: 10 }
                    ],
                    as: 'recentData'
                }
            },
            { $project: { _id: 0, provider: 1, recentData: 1 } }
        ]);
        const integrationData = Object.fromEntries(
            integrationDataRows.map(row => [row.provider, row.recentData])
        );

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
            const userId = new mongoose.Types.ObjectId(req.userId);
            const companyStats = await Company.aggregate([
                { $match: { $or: [{ 'members.user': userId }, { owner: userId }] } },
                {
                    $lookup: {
                        from: TeamProject.collection.name,
                        let: { companyId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$company', '$$companyId'] } } },
                            { $count: 'count' }
                        ],
                        as: 'projectStats'
                    }
                },
                {
                    $lookup: {
                        from: TeamTask.collection.name,
                        let: { companyId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$company', '$$companyId'] },
                                            { $eq: ['$status', 'done'] }
                                        ]
                                    }
                                }
                            },
                            { $count: 'count' }
                        ],
                        as: 'completedTaskStats'
                    }
                },
                {
                    $project: {
                        memberCount: { $size: { $ifNull: ['$members', []] } },
                        projectCount: { $ifNull: [{ $arrayElemAt: ['$projectStats.count', 0] }, 0] },
                        completedTaskCount: { $ifNull: [{ $arrayElemAt: ['$completedTaskStats.count', 0] }, 0] }
                    }
                }
            ]);

            teamMembersCount = companyStats.reduce((sum, company) => sum + company.memberCount, 0);
            teamProjectCount = companyStats.reduce((sum, company) => sum + company.projectCount, 0);
            teamCompletedTasks = companyStats.reduce((sum, company) => sum + company.completedTaskCount, 0);
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
                connectedIntegrations: connectedUserPlatforms.map(p => {
                    const integration = integrations.find(i => i.provider === p);
                    return {
                        platform: p,
                        username: integration?.providerUsername || null,
                        connectedAt: integration?.createdAt || null
                    };
                }),
                integrationData,
                stats,
                trial: trialInfo,
                hasData: Object.keys(integrationData).length > 0 || (stats.activeProjects > 0),
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
 * /api/dashboard/overview:
 *   get:
 *     summary: Get the real-time development command center overview
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     description: Aggregates real workspace data (projects, tasks, agent executions, deployments, sessions, activity) for the dashboard.
 *     responses:
 *       200:
 *         description: Dashboard overview
 *       401:
 *         description: Unauthorized
 */
// Real aggregated dashboard overview (no mock data)
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        const { computeOverview } = require('../utils/dashboardOverview');
        const overview = await computeOverview(req.userId);
        res.json({ success: true, data: overview });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard overview'
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
router.get('/data/:platform', authenticateToken, async (req, res) => {
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
                    },
                    timeout: 15000
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
                    },
                    timeout: 15000
                });
                
                realData.servers = guildsResponse.data.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                    owner: guild.owner,
                    permissions: guild.permissions,
                }));
                // Channel lists need the bot token and one request per guild;
                // `/api/discord/...` exposes them instead of inventing names.
                realData.note = 'Discord channels are available through the Discord integration panel';
                
            } else if (platform === 'figma' && integration.accessToken) {
                // Figma lists projects per team; there is no "my projects"
                // endpoint, so a team id must be stored on the integration.
                const teamId = integration.metadata?.get
                    ? integration.metadata.get('figmaTeamId')
                    : integration.metadata?.figmaTeamId;
                if (teamId) {
                    const projectsResponse = await axios.get(`https://api.figma.com/v1/teams/${encodeURIComponent(teamId)}/projects`, {
                        headers: { 'Authorization': `Bearer ${integration.accessToken}` },
                        timeout: 15000
                    });
                    realData.projects = (projectsResponse.data?.projects || []).map((project) => ({
                        id: project.id,
                        name: project.name,
                    }));
                } else {
                    realData.projects = [];
                    realData.note = 'Select a Figma team to list its projects';
                }
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
// Sync integration data from the provider. Replaces the previous snapshot so
// repeated syncs do not accumulate rows.
router.post('/sync/:platform', authenticateToken, async (req, res) => {
    try {
        const { platform } = req.params;
        const integration = await Integration.findOne({
            userId: req.userId,
            provider: platform,
            isActive: true
        });

        if (!integration) {
            return res.status(404).json({
                success: false,
                message: 'Integration not connected'
            });
        }

        const records = await providerSync.fetchPlatformData(integration);
        const docs = records.map((item) => ({ ...item, userId: req.userId }));
        if (docs.length) {
            await IntegrationData.deleteMany({ userId: req.userId, platform });
            await IntegrationData.insertMany(docs);
        }

        res.json({
            success: true,
            message: `${platform} data synced`,
            itemsAdded: docs.length
        });
    } catch (error) {
        if (error.status === 501) {
            return sendInternalError(req, res, error, { status: 501, code: error.code, message: error.message });
        }
        return sendError(req, res, error);
    }
});


module.exports = router;
