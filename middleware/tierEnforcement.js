/**
 * Tier Enforcement Middleware
 * 
 * Enforces all feature restrictions based on user subscription tier.
 * Reference: BUILDRS_UI_UX_DESIGN_BRIEF.md pricing structure
 * 
 * Tiers: developer, pro, pro_plus, team_standard, team_premium, enterprise
 */

const Subscription = require('../models/Subscription');
const AgentExecution = require('../models/AgentExecution');
const jwt = require('jsonwebtoken');

// Lazy require — DebugRoom and Deployment may not exist on all deploys
let DebugRoom = null;
let Deployment = null;

function getDebugRoom() {
    if (!DebugRoom) {
        try { DebugRoom = require('../models/DebugRoom'); } catch { DebugRoom = null; }
    }
    return DebugRoom;
}

function getDeployment() {
    if (!Deployment) {
        try { Deployment = require('../models/Deployment'); } catch { Deployment = null; }
    }
    return Deployment;
}

function jwtVerify(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}

// === Individual tier checks ===

function enforceMinTier(minTier) {
    const tierOrder = ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];
    return function(req, res, next) {
        const subscription = req.subscription;
        const currentIndex = tierOrder.indexOf(subscription.tier);
        const requiredIndex = tierOrder.indexOf(minTier);
        if (currentIndex < requiredIndex) {
            return res.status(403).json({
                success: false,
                message: `Requires ${minTier} tier or higher. Your current tier: ${subscription.tier}`,
                code: 'TIER_RESTRICTION',
                requiresUpgrade: true,
                requiredTier: minTier
            });
        }
        next();
    };
}

function enforceConcurrentJobs(maxJobs) {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const limit = subscription.getMaxConcurrentAgentJobs();
        if (limit === 0) {
            return res.status(403).json({
                success: false,
                message: 'Agent delegation not available on Developer tier. Upgrade to Pro for 1 concurrent job.',
                code: 'AGENT_LIMIT_REACHED',
                requiresUpgrade: true,
                currentTier: subscription.tier,
                maxJobs: 1,
                currentJobs: 0
            });
        }
        if (limit !== null) {
            const activeCount = await AgentExecution.countDocuments({
                userId: req.userId,
                status: { $in: ['running', 'awaiting_approval'] }
            });
            if (activeCount >= limit) {
                return res.status(403).json({
                    success: false,
                    message: `You have reached the limit of ${limit} concurrent agent jobs. Upgrade for more.`,
                    code: 'AGENT_LIMIT_REACHED',
                    requiresUpgrade: true,
                    currentJobs: activeCount,
                    maxJobs: limit
                });
            }
        }
        next();
    };
}

function enforceTaskTimeout() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const maxTimeout = subscription.getTaskTimeoutMinutes();
        if (req.body.timeout && req.body.timeout > maxTimeout) {
            return res.status(403).json({
                success: false,
                message: `Task timeout cannot exceed ${maxTimeout} minutes on ${subscription.tier} tier.`,
                code: 'TIMEOUT_EXCEEDED',
                requiresUpgrade: true,
                maxTimeout,
                requestedTimeout: req.body.timeout
            });
        }
        next();
    };
}

function enforceDebugRoomAccess() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        if (subscription.tier === 'developer') {
            return res.status(403).json({
                success: false,
                message: 'Debug Rooms are Viewer Only on Developer tier. Upgrade to Pro to host.',
                code: 'DEBUG_ROOM_RESTRICTED',
                requiresUpgrade: true,
                currentTier: subscription.tier
            });
        }
        next();
    };
}

function enforceDebugRoomLimit() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const maxHostRooms = subscription.getMaxDebugHostRooms();
        if (maxHostRooms === 0) return next();
        const Model = getDebugRoom();
        if (!Model) return next();
        const activeRooms = await Model.countDocuments({
            hostId: req.userId,
            status: 'active'
        });
        if (activeRooms >= maxHostRooms && maxHostRooms !== Infinity) {
            return res.status(403).json({
                success: false,
                message: `You have reached the limit of ${maxHostRooms} active debug rooms. Upgrade for more.`,
                code: 'DEBUG_ROOM_LIMIT_REACHED',
                activeRooms,
                maxHostRooms
            });
        }
        next();
    };
}

function enforceDeploymentLimit() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const maxDeployments = subscription.getMaxActiveDeployments();
        const Model = getDeployment();
        if (!Model) return next();
        const activeDeployments = await Model.countDocuments({
            userId: req.userId,
            status: 'active'
        });
        if (activeDeployments >= maxDeployments && maxDeployments !== Infinity) {
            return res.status(403).json({
                success: false,
                message: `You have reached the limit of ${maxDeployments} active deployments. Upgrade for more.`,
                code: 'DEPLOYMENT_LIMIT_REACHED',
                currentCount: activeDeployments,
                maxDeployments
            });
        }
        next();
    };
}

function enforceCloudComputeLimit() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const monthlyLimit = subscription.getCloudComputeHours();
        if (monthlyLimit === 0 && subscription.tier === 'developer') {
            return res.status(403).json({
                success: false,
                message: 'Cloud compute is disabled on Developer tier. Use local WebContainers or upgrade.',
                code: 'COMPUTE_LIMIT_REACHED',
                requiresUpgrade: true
            });
        }
        if (monthlyLimit !== null) {
            const used = subscription.cloudComputeHours?.usedThisMonth || 0;
            if (used >= monthlyLimit) {
                return res.status(403).json({
                    success: false,
                    message: `You've used ${monthlyLimit}h of cloud compute this month. Upgrade for more.`,
                    code: 'COMPUTE_LIMIT_REACHED',
                    usedThisMonth: used,
                    monthlyLimit
                });
            }
        }
        next();
    };
}

function enforceCreditPool() {
    return async (req, res, next) => {
        const subscription = req.subscription;
        const monthlyLimit = subscription.getMonthlyCreditLimit();
        if (monthlyLimit === 0 && subscription.tier === 'developer') {
            return res.status(403).json({
                success: false,
                message: 'Cloud AI credits are disabled on Developer tier. Use local models (BYOM) or upgrade.',
                code: 'CREDIT_LIMIT_REACHED',
                requiresUpgrade: true
            });
        }
        if (monthlyLimit !== null) {
            const used = subscription.creditPool?.usedThisMonth || 0;
            const remaining = monthlyLimit - used;
            if (remaining <= 0) {
                return res.status(403).json({
                    success: false,
                    message: `You've exhausted your ${monthlyLimit} monthly AI credits. Enable Pay-As-You-Go or upgrade.`,
                    code: 'CREDIT_LIMIT_REACHED',
                    usedThisMonth: used,
                    monthlyLimit,
                    remaining: 0
                });
            }
        }
        next();
    };
}

function enforceSpecEngineLevel(minLevel) {
    const levels = ['read_only', 'full_sdd', 'realtime_drift', 'team_library', 'cross_repo', 'custom'];
    return function(req, res, next) {
        const subscription = req.subscription;
        const currentLevel = subscription.getSpecEngineLevel();
        const currentIndex = levels.indexOf(currentLevel);
        const requiredIndex = levels.indexOf(minLevel);
        if (currentIndex < requiredIndex) {
            const tierNames = { read_only: 'Developer', full_sdd: 'Pro', realtime_drift: 'Pro+', team_library: 'Team Standard', cross_repo: 'Team Premium', custom: 'Enterprise' };
            return res.status(403).json({
                success: false,
                message: `Spec engine level "${minLevel}" requires ${tierNames[minLevel]} tier. Your level: ${currentLevel}`,
                code: 'SPEC_ENGINE_RESTRICTED',
                requiresUpgrade: true,
                currentLevel,
                requiredLevel: minLevel
            });
        }
        next();
    };
}

// === Credit deduction helpers ===

async function deductCredits(userId, amount = 1) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return { success: false, message: 'No subscription found', remaining: 0 };
    if (subscription.tier === 'developer') return { success: false, message: 'No cloud AI credits on Developer tier' };

    const monthlyLimit = subscription.getMonthlyCreditLimit();
    const used = subscription.creditPool?.usedThisMonth || 0;
    const remaining = monthlyLimit ? monthlyLimit - used : Infinity;

    if (remaining === Infinity) {
        return { success: true, overage: false, remaining: Infinity };
    }

    if (amount > remaining) {
        if (subscription.allowPayAsYouGo) {
            subscription.creditPool.usedThisMonth += amount;
            await subscription.save();
            return { success: true, overage: true, amountDeducted: amount };
        }
        return { success: false, message: 'Insufficient credits', remaining };
    }

    subscription.creditPool.usedThisMonth += amount;
    await subscription.save();
    return { success: true, overage: false, remaining: remaining - amount, amountDeducted: amount };
}

async function deductComputeHours(userId, hours = 1) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return { success: false };
    const monthlyLimit = subscription.getCloudComputeHours();
    const used = subscription.cloudComputeHours?.usedThisMonth || 0;
    const remaining = monthlyLimit ? monthlyLimit - used : Infinity;
    if (hours > remaining) return { success: false, remaining };
    subscription.cloudComputeHours.usedThisMonth += hours;
    await subscription.save();
    return { success: true, hoursDeducted: hours };
}

// === Main exports ===

module.exports = {
    enforceMinTier,
    enforceConcurrentJobs,
    enforceTaskTimeout,
    enforceDebugRoomAccess,
    enforceDebugRoomLimit,
    enforceDeploymentLimit,
    enforceCloudComputeLimit,
    enforceCreditPool,
    enforceSpecEngineLevel,
    deductCredits,
    deductComputeHours
};
