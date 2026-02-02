const Company = require('../models/Company');
const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');

// Tier limits configuration
const TIER_LIMITS = {
    freebie: {
        maxMembers: 1,
        maxProjects: 1,
        maxTasksPerProject: 5,
        maxStorageMB: 50,
        maxIntegrations: 0,
        maxMeetingsPerMonth: 0,
        features: {
            teamChat: false,
            aiPair: false,
            advancedAnalytics: false,
            customBranding: false,
            prioritySupport: false,
            videoMeetings: false,
            codeCollaboration: false,
            integrations: false
        }
    },
    professional: {
        maxMembers: 10,
        maxProjects: 50,
        maxTasksPerProject: 100,
        maxStorageMB: 5000,
        maxIntegrations: 5,
        maxMeetingsPerMonth: 100,
        features: {
            teamChat: true,
            aiPair: true,
            advancedAnalytics: true,
            customBranding: true,
            prioritySupport: true,
            videoMeetings: true,
            codeCollaboration: true,
            integrations: true
        }
    },
    enterprise: {
        maxMembers: -1, // unlimited
        maxProjects: -1,
        maxTasksPerProject: -1,
        maxStorageMB: -1,
        maxIntegrations: -1,
        maxMeetingsPerMonth: -1,
        features: {
            teamChat: true,
            aiPair: true,
            advancedAnalytics: true,
            customBranding: true,
            prioritySupport: true,
            videoMeetings: true,
            codeCollaboration: true,
            integrations: true,
            sso: true,
            auditLogs: true,
            dedicatedSupport: true
        }
    }
};

// Check if company can add more members
async function checkMemberLimit(req, res, next) {
    try {
        const { companyId } = req.params;
        const company = await Company.findById(companyId);
        
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        const tier = company.subscription.tier || 'freebie';
        const limits = TIER_LIMITS[tier];
        const currentMembers = company.members.length;

        // Check if unlimited (-1) or within limit
        if (limits.maxMembers !== -1 && currentMembers >= limits.maxMembers) {
            return res.status(403).json({
                success: false,
                message: `Member limit reached. ${tier} tier allows ${limits.maxMembers} member(s).`,
                currentCount: currentMembers,
                limit: limits.maxMembers,
                tier: tier,
                requiresUpgrade: true,
                upgradeUrl: '/pricing.html'
            });
        }

        req.companyLimits = limits;
        next();
    } catch (error) {
        console.error('Member limit check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking member limit'
        });
    }
}

// Check if company can create more projects
async function checkProjectLimit(req, res, next) {
    try {
        const { companyId } = req.params;
        const company = await Company.findById(companyId);
        
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        const tier = company.subscription.tier || 'freebie';
        const limits = TIER_LIMITS[tier];
        const currentProjects = company.stats.totalProjects || 0;

        if (limits.maxProjects !== -1 && currentProjects >= limits.maxProjects) {
            return res.status(403).json({
                success: false,
                message: `Project limit reached. ${tier} tier allows ${limits.maxProjects} project(s).`,
                currentCount: currentProjects,
                limit: limits.maxProjects,
                tier: tier,
                requiresUpgrade: true,
                upgradeUrl: '/pricing.html'
            });
        }

        req.companyLimits = limits;
        next();
    } catch (error) {
        console.error('Project limit check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking project limit'
        });
    }
}

// Check if company can create more tasks
async function checkTaskLimit(req, res, next) {
    try {
        const { companyId, projectId } = req.params;
        const company = await Company.findById(companyId);
        
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        const tier = company.subscription.tier || 'freebie';
        const limits = TIER_LIMITS[tier];
        
        // Get task count for this project
        const TeamTask = require('../models/TeamTask');
        const taskCount = await TeamTask.countDocuments({ 
            company: companyId,
            project: projectId 
        });

        if (limits.maxTasksPerProject !== -1 && taskCount >= limits.maxTasksPerProject) {
            return res.status(403).json({
                success: false,
                message: `Task limit reached. ${tier} tier allows ${limits.maxTasksPerProject} task(s) per project.`,
                currentCount: taskCount,
                limit: limits.maxTasksPerProject,
                tier: tier,
                requiresUpgrade: true,
                upgradeUrl: '/pricing.html'
            });
        }

        req.companyLimits = limits;
        next();
    } catch (error) {
        console.error('Task limit check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking task limit'
        });
    }
}

// Check if feature is available for tier
function requireTeamFeature(featureName) {
    return async (req, res, next) => {
        try {
            const { companyId } = req.params;
            const company = await Company.findById(companyId);
            
            if (!company) {
                return res.status(404).json({
                    success: false,
                    message: 'Company not found'
                });
            }

            const tier = company.subscription.tier || 'freebie';
            const limits = TIER_LIMITS[tier];

            if (!limits.features[featureName]) {
                return res.status(403).json({
                    success: false,
                    message: `${featureName} is not available in ${tier} tier.`,
                    feature: featureName,
                    tier: tier,
                    requiresUpgrade: true,
                    upgradeUrl: '/pricing.html',
                    availableIn: getFeatureAvailability(featureName)
                });
            }

            req.companyLimits = limits;
            next();
        } catch (error) {
            console.error('Feature check error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking feature availability'
            });
        }
    };
}

// Get which tiers have a feature
function getFeatureAvailability(featureName) {
    const available = [];
    for (const [tier, config] of Object.entries(TIER_LIMITS)) {
        if (config.features[featureName]) {
            available.push(tier);
        }
    }
    return available;
}

// Get limits for a company
async function getCompanyLimits(companyId) {
    try {
        const Company = require('../models/Company');
        const Subscription = require('../models/Subscription');
        
        const company = await Company.findById(companyId).populate('owner');
        if (!company) return null;

        // Sync company tier with owner's subscription
        const ownerSubscription = await Subscription.findOne({ user: company.owner._id });
        const ownerTier = ownerSubscription?.tier || 'freebie';
        
        // Update company tier if it doesn't match
        if (company.subscription.tier !== ownerTier) {
            const memberLimit = ownerTier === 'freebie' ? 1 : ownerTier === 'professional' ? 10 : 999999;
            company.subscription.tier = ownerTier;
            company.subscription.memberLimit = memberLimit;
            await company.save();
        }

        const tier = company.subscription.tier || 'freebie';
        return {
            tier,
            limits: TIER_LIMITS[tier],
            current: {
                members: company.members.length,
                projects: company.stats.totalProjects || 0,
                tasks: company.stats.totalTasks || 0
            }
        };
    } catch (error) {
        console.error('Get limits error:', error);
        return null;
    }
}

// Check user's personal subscription for individual features
async function checkUserSubscription(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const subscription = await Subscription.findOne({ userId: decoded.id });
        
        if (!subscription || subscription.tier === 'freebie') {
            return res.status(403).json({
                success: false,
                message: 'This feature requires a paid subscription',
                tier: subscription?.tier || 'freebie',
                requiresUpgrade: true,
                upgradeUrl: '/pricing.html'
            });
        }

        req.subscription = subscription;
        req.userId = decoded.id;
        next();
    } catch (error) {
        console.error('User subscription check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking subscription'
        });
    }
}

module.exports = {
    checkMemberLimit,
    checkProjectLimit,
    checkTaskLimit,
    requireTeamFeature,
    getCompanyLimits,
    checkUserSubscription,
    TIER_LIMITS
};
