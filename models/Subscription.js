const mongoose = require('mongoose');
const { TIER_LIMITS, limitFor } = require('../utils/tierLimits');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    tier: {
        type: String,
        enum: ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'],
        default: 'developer'
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'trial', 'past_due'],
        default: 'active'
    },
    // Legacy trial/billing fields — still present on existing documents
    features: { type: mongoose.Schema.Types.Mixed },
    trialStartedAt: { type: Date },
    trialEndsAt: { type: Date },
    isTrialWithCard: { type: Boolean, default: false },
    cardAddedAt: { type: Date },
    firstChargeAt: { type: Date },
    firstChargeCompleted: { type: Boolean, default: false },
    nextBillingDate: { type: Date },
    // Current paid period. Historical writes to these were dropped by Mongoose
    // strict mode (the fields were never declared), so lifecycle code must fall
    // back to nextBillingDate/trialEndsAt for pre-existing documents.
    startDate: { type: Date },
    endDate: { type: Date },
    // Cancellation: a paid plan is not revoked early. `cancelAtPeriodEnd` keeps
    // the current tier live until `changeEffectiveAt`, then drops to developer.
    cancelledAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    // Downgrade/scheduled switch: the tier to move to once `changeEffectiveAt` hits.
    pendingTier: {
        type: String,
        enum: ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise']
    },
    changeEffectiveAt: { type: Date },
    billingCycle: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    // Team billing
    teamSize: { type: Number, default: 1 },
    seats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Credit pool tracking
    creditPool: {
        monthlyLimit: { type: Number, default: 0 },
        usedThisMonth: { type: Number, default: 0 },
        resetAt: { type: Date, default: () => new Date(new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear(), 0, 1) }
    },
    // Cloud compute
    cloudComputeHours: {
        monthlyLimit: { type: Number, default: 0 },
        usedThisMonth: { type: Number, default: 0 }
    },
    // Runtime
    runtimeTier: {
        type: String,
        enum: ['tier1_webcontainer', 'tier2_cloud'],
        default: 'tier1_webcontainer'
    },
    // Concurrent agent jobs
    maxConcurrentAgentJobs: { type: Number, default: 0 },
    taskTimeoutMinutes: { type: Number, default: 5 },
    // Debug rooms
    maxDebugHostRooms: { type: Number, default: 0 },
    maxDebugParticipants: { type: Number, default: 0 },
    // Deployments
    maxActiveDeployments: { type: Number, default: 1 },
    // Spec engine
    specEngineLevel: {
        type: String,
        enum: ['read_only', 'full_sdd', 'realtime_drift', 'team_library', 'cross_repo', 'custom'],
        default: 'read_only'
    },
    // Team features
    teamSpecLibrary: { type: Boolean, default: false },
    teamRBAC: { type: Boolean, default: false },
    orgPrivacyMode: { type: Boolean, default: false },
    // Enterprise features
    ssoAuthentication: { type: Boolean, default: false },
    scimProvisioning: { type: Boolean, default: false },
    auditLogs: { type: Boolean, default: false },
    dedicatedAccountManager: { type: Boolean, default: false },
    slaUptime: { type: Boolean, default: false },
    // Data retention
    dataRetentionDays: { type: Number, default: 7 },
    // WebRTC
    webrtcVoiceEnabled: { type: Boolean, default: false },
    maxWebRTCParticipants: { type: Number, default: 0 },
    // Payment
    paymentProvider: {
        type: String,
        enum: ['stripe', 'paystack', 'flutterwave', 'manual'],
        default: 'stripe'
    },
    paymentId: String,
    customerId: String,
    // Billing
    pricing: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' },
        interval: { type: String, enum: ['monthly', 'yearly', 'custom', 'trial'], default: 'monthly' }
    },
    // Team pooled credits
    teamPooledCredits: { type: Number, default: 0 },
    // Overages
    allowPayAsYouGo: { type: Boolean, default: false },
    // Edge routing
    edgeNodes: { type: Object, default: {} },
    // Entitlement
    entitlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entitlement' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

subscriptionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    // Reset credits at month boundary
    const now = new Date();
    const resetDate = this.creditPool.resetAt;
    if (resetDate && now > resetDate) {
        this.creditPool.usedThisMonth = 0;
        this.cloudComputeHours.usedThisMonth = 0;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        this.creditPool.resetAt = nextMonth;
    }
    next();
});

subscriptionSchema.methods.getMonthlyCreditLimit = function() {
    return limitFor(this.tier, 'monthlyCredits');
};

subscriptionSchema.methods.getCloudComputeHours = function() {
    return limitFor(this.tier, 'cloudComputeHours');
};

subscriptionSchema.methods.getMaxConcurrentAgentJobs = function() {
    return limitFor(this.tier, 'maxConcurrentAgentJobs');
};

subscriptionSchema.methods.getTaskTimeoutMinutes = function() {
    return limitFor(this.tier, 'taskTimeoutMinutes');
};

subscriptionSchema.methods.getMaxDebugHostRooms = function() {
    if (!TIER_LIMITS[this.tier]) return 0;
    return limitFor(this.tier, 'maxDebugHostRooms');
};

subscriptionSchema.methods.getMaxDebugParticipants = function() {
    if (!TIER_LIMITS[this.tier]) return 0;
    return limitFor(this.tier, 'maxDebugParticipants');
};

subscriptionSchema.methods.getMaxActiveDeployments = function() {
    if (!TIER_LIMITS[this.tier]) return 1;
    return limitFor(this.tier, 'maxActiveDeployments');
};

subscriptionSchema.methods.getSpecEngineLevel = function() {
    const levels = {
        developer: 'read_only',
        pro: 'full_sdd',
        pro_plus: 'realtime_drift',
        team_standard: 'team_library',
        team_premium: 'cross_repo',
        enterprise: 'custom'
    };
    return levels[this.tier] ?? 'read_only';
};

subscriptionSchema.methods.isWebRTCEnabled = function() {
    return ['pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'].includes(this.tier);
};

subscriptionSchema.methods.isDebugRoomHostAllowed = function() {
    return ['pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'].includes(this.tier);
};

subscriptionSchema.methods.canUseCloudAgent = function() {
    return ['pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'].includes(this.tier);
};

subscriptionSchema.methods.isTeamTier = function() {
    return ['team_standard', 'team_premium', 'enterprise'].includes(this.tier);
};

subscriptionSchema.methods.isEnterpriseTier = function() {
    return this.tier === 'enterprise';
};

subscriptionSchema.methods.hasFeature = function(featureName) {
    return this.features?.[featureName] === true;
};

subscriptionSchema.methods.canUseFeature = function(feature, context = {}) {
    const featureKeys = {
        concurrentAgentJobs: 'maxConcurrentAgentJobs',
        taskTimeout: 'taskTimeoutMinutes',
        debugHostRooms: 'maxDebugHostRooms',
        debugParticipants: 'maxDebugParticipants',
        activeDeployments: 'maxActiveDeployments',
        cloudComputeHours: 'cloudComputeHours',
        monthlyCredits: 'monthlyCredits',
    };
    const key = featureKeys[feature];
    if (!key || !TIER_LIMITS[this.tier]) return false;
    const limit = limitFor(this.tier, key);
    if (limit === null) return true; // unlimited/custom
    if (limit === 0) return false;
    return limit;
};

// Compute days left in trial
subscriptionSchema.methods.getTrialDaysLeft = function() {
    if (!this.trialEndsAt || this.status !== 'trial') return 0;
    const diff = this.trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// Check if trial is on its last day
subscriptionSchema.methods.isLastTrialDay = function() {
    return this.getTrialDaysLeft() <= 1 && this.status === 'trial';
};

// Check if trial has expired
subscriptionSchema.methods.isTrialExpired = function() {
    return this.status === 'trial' && this.trialEndsAt && this.trialEndsAt.getTime() < Date.now();
};

// Upgrade subscription to a given tier (canonical pricing tiers only:
// developer, pro, pro_plus, team_standard, team_premium, enterprise).
// Legacy tier names (freebie, starter, professional) map to their canonical equivalent.
subscriptionSchema.methods.upgradeTo = function(tier) {
    const { TIERS, LEGACY_TIER_MAP } = require('../utils/tierNames');
    const resolved = TIERS.includes(tier) ? tier : LEGACY_TIER_MAP[tier];
    if (!resolved) {
        throw new Error(`Unknown tier: ${tier}. Valid tiers: ${TIERS.join(', ')}`);
    }

    // Feature entitlements shared by every paid tier (mirrors the pricing blueprint)
    const PAID_FEATURES = {
        maxProjects: 0,
        unlimitedProjects: true,
        basicAiAssistance: true,
        advancedAiAssistance: true,
        aiCodeReview: true,
        communitySupport: false,
        prioritySupport: true,
        limitedApiAccess: false,
        fullApiAccess: true,
        supportResponseHours: 24,
        localRepositories: true,
        discordSync: true,
        advancedAnalytics: true,
        teamCollaboration: true,
        customIntegrations: true,
        videoStandups: true,
        collaborativeEditing: true
    };
    const tiers = {
        developer: {
            amount: 0,
            interval: 'monthly',
            features: {
                maxProjects: 3,
                basicAiAssistance: true,
                communitySupport: true,
                limitedApiAccess: false,
                supportResponseHours: 72,
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: false,
                advancedAiAssistance: false,
                aiCodeReview: false,
                fullApiAccess: false,
                prioritySupport: false,
                teamCollaboration: false,
                customIntegrations: false,
                unlimitedProjects: false
            }
        },
        pro: { amount: 20, interval: 'monthly', features: { ...PAID_FEATURES, maxProjects: 10, unlimitedProjects: false } },
        pro_plus: { amount: 60, interval: 'monthly', features: { ...PAID_FEATURES } },
        team_standard: { amount: 40, interval: 'monthly', features: { ...PAID_FEATURES } },
        team_premium: { amount: 120, interval: 'monthly', features: { ...PAID_FEATURES } },
        enterprise: {
            amount: 299,
            interval: 'monthly',
            features: {
                ...PAID_FEATURES,
                supportResponseHours: 1,
                oneHourSupport: true,
                soc2Compliance: true,
                dedicatedSupport: true,
                ssoAuthentication: true,
                customContracts: true,
                slaAgreement: true,
                dedicatedAccountManager: true
            }
        }
    };

    const tierConfig = tiers[resolved];
    this.tier = resolved;
    this.features = { ...tierConfig.features };
    if (tierConfig.amount !== undefined && this.pricing) {
        this.pricing.amount = tierConfig.amount;
    }
    if (tierConfig.interval && this.pricing) {
        this.pricing.interval = tierConfig.interval;
    }

    this.syncTierRestrictions(resolved);
};

/**
 * Apply a tier's restriction profile (credits, compute, agent jobs, spec
 * engine, retention, team flags) to this subscription.
 *
 * Deliberately separate from upgradeTo: re-pricing a user is a billing event,
 * but a tier's restrictions can drift when the profile changes or when a
 * subscription was written before the profile existed. This only touches the
 * limit fields, so usage counters (creditPool.usedThisMonth) and pricing are
 * left alone.
 */
subscriptionSchema.methods.syncTierRestrictions = function(tier = this.tier) {
    const entitlements = subscriptionSchema.statics.tierConfigs?.[tier];
    if (!entitlements) return false;

    this.creditPool.monthlyLimit = entitlements.monthlyCreditLimit === undefined ? 0 : entitlements.monthlyCreditLimit;
    this.cloudComputeHours.monthlyLimit = entitlements.cloudComputeHours === undefined ? 0 : entitlements.cloudComputeHours;
    this.maxConcurrentAgentJobs = entitlements.maxConcurrentJobs === undefined ? 0 : entitlements.maxConcurrentJobs;
    this.taskTimeoutMinutes = entitlements.taskTimeout === undefined ? 5 : entitlements.taskTimeout;
    this.maxDebugHostRooms = entitlements.maxDebugHostRooms === undefined ? 0 : entitlements.maxDebugHostRooms;
    this.maxDebugParticipants = entitlements.maxDebugParticipants === undefined ? 0 : entitlements.maxDebugParticipants;
    this.maxActiveDeployments = entitlements.maxDeployments === undefined ? 1 : entitlements.maxDeployments;
    this.specEngineLevel = entitlements.specEngineLevel || 'read_only';
    this.webrtcVoiceEnabled = Boolean(entitlements.webrtcEnabled);
    this.dataRetentionDays = entitlements.dataRetentionDays === undefined ? 7 : entitlements.dataRetentionDays;
    this.teamSpecLibrary = Boolean(entitlements.features?.teamLibrary);
    this.teamRBAC = Boolean(entitlements.features?.rbac);
    return true;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);

// Indexes for the hot cron paths (billingCron per-minute trial scan,
// creditPoolService hourly reset scan) — the schema previously had none
// (only the userId unique index).
subscriptionSchema.index({ status: 1, trialEndsAt: 1 });
subscriptionSchema.index({ status: 1, 'creditPool.resetAt': 1 });

subscriptionSchema.statics.tierConfigs = {
    developer: {
        amount: 0, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.developer.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.developer.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.developer.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.developer.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.developer.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.developer.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.developer.maxActiveDeployments,
        specEngineLevel: 'read_only', webrtcEnabled: false, dataRetentionDays: 7,
        features: { localModels: true, webcontainers: true, cloudAgents: false }
    },
    pro: {
        amount: 20, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.pro.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.pro.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.pro.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.pro.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.pro.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.pro.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.pro.maxActiveDeployments,
        specEngineLevel: 'full_sdd', webrtcEnabled: true, dataRetentionDays: 14,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true }
    },
    pro_plus: {
        amount: 60, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.pro_plus.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.pro_plus.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.pro_plus.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.pro_plus.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.pro_plus.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.pro_plus.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.pro_plus.maxActiveDeployments,
        specEngineLevel: 'realtime_drift', webrtcEnabled: true, dataRetentionDays: 30,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, realtimeDrift: true }
    },
    team_standard: {
        amount: 40, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.team_standard.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.team_standard.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.team_standard.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.team_standard.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.team_standard.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.team_standard.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.team_standard.maxActiveDeployments,
        specEngineLevel: 'team_library', webrtcEnabled: true, dataRetentionDays: 30,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true }
    },
    team_premium: {
        amount: 120, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.team_premium.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.team_premium.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.team_premium.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.team_premium.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.team_premium.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.team_premium.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.team_premium.maxActiveDeployments,
        specEngineLevel: 'cross_repo', webrtcEnabled: true, dataRetentionDays: 90,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true, crossRepo: true, sso: false }
    },
    enterprise: {
        amount: null, interval: 'custom', currency: 'USD',
        monthlyCreditLimit: TIER_LIMITS.enterprise.monthlyCredits,
        cloudComputeHours: TIER_LIMITS.enterprise.cloudComputeHours,
        maxConcurrentJobs: TIER_LIMITS.enterprise.maxConcurrentAgentJobs,
        taskTimeout: TIER_LIMITS.enterprise.taskTimeoutMinutes,
        maxDebugHostRooms: TIER_LIMITS.enterprise.maxDebugHostRooms,
        maxDebugParticipants: TIER_LIMITS.enterprise.maxDebugParticipants,
        maxDeployments: TIER_LIMITS.enterprise.maxActiveDeployments,
        specEngineLevel: 'custom', webrtcEnabled: true, dataRetentionDays: null,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true, crossRepo: true, sso: true, audit: true, scim: true }
    }
};

// Statics assigned after mongoose.model() are not copied onto the compiled
// model, so Model.tierConfigs would silently be undefined. Mirror them for
// callers that read the profiles off the model.
module.exports.tierConfigs = subscriptionSchema.statics.tierConfigs;
