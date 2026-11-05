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
const { limitAllows } = require('../utils/tierLimits');
const { DEFAULT_COMPUTE_OVERAGE_CAP_MINOR } = require('../utils/overagePolicy');

// Reserve a tiny slice of the monthly allowance at request start. Without it,
// concurrent starts all read the same `usedThisMonth` and pass the preflight
// check together. The meter subtracts this reservation from the real duration.
const DEFAULT_COMPUTE_RESERVATION_HOURS = 1 / 60;
function computeReservationHours() {
    const configured = Number(process.env.COMPUTE_RESERVATION_HOURS);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_COMPUTE_RESERVATION_HOURS;
}

async function reserveComputeHours(subscription, monthlyLimit, overageCapMinor) {
    if (!subscription?._id) return true;
    const hours = computeReservationHours();
    const updated = await Subscription.findOneAndUpdate(
        {
            _id: subscription._id,
            $expr: {
                $or: [
                    {
                        $lte: [
                            { $add: [{ $ifNull: ['$cloudComputeHours.usedThisMonth', 0] }, hours] },
                            monthlyLimit,
                        ],
                    },
                    {
                        $and: [
                            { $eq: ['$cloudComputeHours.overageEnabled', true] },
                            { $lt: [{ $ifNull: ['$cloudComputeHours.overageAmountMinor', 0] }, overageCapMinor] },
                        ],
                    },
                ],
            },
        },
        { $inc: { 'cloudComputeHours.usedThisMonth': hours } },
        { new: true }
    );
    return Boolean(updated);
}

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
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
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
        const localModelRequested = ['ollama', 'lm-studio'].includes(req.body?.provider);
        const limit = localModelRequested && subscription.tier === 'developer'
            ? 1
            : subscription.getMaxConcurrentAgentJobs();
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
        // NOTE (rec 12): the `maxHostRooms === 0` early pass above is preserved
        // verbatim. It means developer tier skips this enforcement entirely
        // (unlimited hosting), which contradicts the "viewer only" entitlement
        // — flagged as a policy question for the team, not changed here.
        if (!limitAllows(maxHostRooms, activeRooms)) {
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
        if (!limitAllows(maxDeployments, activeDeployments)) {
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
        if (['ollama', 'lm-studio'].includes(req.body?.provider)) return next();
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
            const overageEnabled = subscription.cloudComputeHours?.overageEnabled === true;
            const configuredCap = Number(subscription.cloudComputeHours?.overageCapMinor);
            const overageCapMinor = Number.isFinite(configuredCap) && configuredCap >= 0
                ? configuredCap
                : DEFAULT_COMPUTE_OVERAGE_CAP_MINOR;
            const overageAmountMinor = subscription.cloudComputeHours?.overageAmountMinor || 0;
            const overageCapReached = overageEnabled && overageAmountMinor >= overageCapMinor;

            if (used >= monthlyLimit && (!overageEnabled || overageCapReached)) {
                return res.status(403).json({
                    success: false,
                    message: overageCapReached
                        ? `You've reached your ${(overageCapMinor / 100).toFixed(2)} USD monthly compute overage cap. Upgrade for more.`
                        : `You've used ${monthlyLimit}h of cloud compute this month. Enable overage or upgrade for more.`,
                    code: 'COMPUTE_LIMIT_REACHED',
                    usedThisMonth: used,
                    monthlyLimit,
                    overageHours: subscription.cloudComputeHours?.overageHoursThisMonth || 0,
                    overageAmountMinor,
                    overageEnabled,
                    overageCapMinor,
                    overageCapReached
                });
            }

            const reserved = await reserveComputeHours(subscription, monthlyLimit, overageCapMinor);
            if (!reserved) {
                return res.status(403).json({
                    success: false,
                    message: `You've used ${monthlyLimit}h of cloud compute this month. Enable overage or upgrade for more.`,
                    code: 'COMPUTE_LIMIT_REACHED',
                    usedThisMonth: used,
                    monthlyLimit,
                    overageEnabled,
                    overageCapMinor,
                    overageCapReached,
                });
            }

            const hours = computeReservationHours();
            req.computeReservationHours = hours;
            let consumed = false;
            req.consumeComputeReservation = () => { consumed = true; };
            if (typeof res.once === 'function') {
                res.once('finish', () => {
                    if (consumed) return;
                    const CreditPoolService = require('../utils/creditPoolService');
                    CreditPoolService.releaseComputeHours(req.userId, hours).catch((error) => {
                        console.error('Compute reservation release failed:', error.message);
                    });
                });
            }
        }
        next();
    };
}

function enforceCreditPool() {
    return async (req, res, next) => {
        if (['ollama', 'lm-studio'].includes(req.body?.provider)) return next();
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
            // Pay-As-You-Go must reach the route so deduction can record the
            // overage; otherwise the exhausted-pool guard blocks it forever.
            if (remaining <= 0 && !subscription.allowPayAsYouGo) {
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
    enforceSpecEngineLevel
};
