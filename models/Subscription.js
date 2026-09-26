const mongoose = require('mongoose');

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
        interval: { type: String, enum: ['monthly', 'yearly', 'custom'], default: 'monthly' }
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
    const limits = {
        developer: 0,
        pro: 20,
        pro_plus: 70,
        team_standard: 40,
        team_premium: 200,
        enterprise: null // custom
    };
    return limits[this.tier] ?? null;
};

subscriptionSchema.methods.getCloudComputeHours = function() {
    const hours = {
        developer: 0,
        pro: 10,
        pro_plus: 50,
        team_standard: 25,
        team_premium: 120,
        enterprise: null // custom
    };
    return hours[this.tier] ?? null;
};

subscriptionSchema.methods.getMaxConcurrentAgentJobs = function() {
    const jobs = {
        developer: 0,
        pro: 1,
        pro_plus: 3,
        team_standard: 2,
        team_premium: 5,
        enterprise: null // custom / dedicated queue
    };
    return jobs[this.tier] ?? null;
};

subscriptionSchema.methods.getTaskTimeoutMinutes = function() {
    const timeouts = {
        developer: 5,
        pro: 15,
        pro_plus: 30,
        team_standard: 30,
        team_premium: 60,
        enterprise: null // custom / no timeout
    };
    return timeouts[this.tier] ?? null;
};

subscriptionSchema.methods.getMaxDebugHostRooms = function() {
    const rooms = {
        developer: 0, // viewer only
        pro: 1,
        pro_plus: 3,
        team_standard: Infinity,
        team_premium: Infinity,
        enterprise: Infinity // custom
    };
    return rooms[this.tier] ?? 0;
};

subscriptionSchema.methods.getMaxDebugParticipants = function() {
    const participants = {
        developer: 0, // viewer only
        pro: 2,
        pro_plus: 4,
        team_standard: 4,
        team_premium: 8,
        enterprise: Infinity // custom
    };
    return participants[this.tier] ?? 0;
};

subscriptionSchema.methods.getMaxActiveDeployments = function() {
    const deployments = {
        developer: 1,
        pro: 3,
        pro_plus: 10,
        team_standard: 20,
        team_premium: Infinity,
        enterprise: Infinity // custom
    };
    return deployments[this.tier] ?? 1;
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
    const tier = this.tier;
    const limits = {
        // Agent delegation limits
        concurrentAgentJobs: {
            developer: 0, pro: 1, pro_plus: 3, team_standard: 2, team_premium: 5, enterprise: null
        },
        taskTimeout: {
            developer: 5, pro: 15, pro_plus: 30, team_standard: 30, team_premium: 60, enterprise: null
        },
        debugHostRooms: {
            developer: 0, pro: 1, pro_plus: 3, team_standard: Infinity, team_premium: Infinity, enterprise: Infinity
        },
        debugParticipants: {
            developer: 0, pro: 2, pro_plus: 4, team_standard: 4, team_premium: 8, enterprise: Infinity
        },
        activeDeployments: {
            developer: 1, pro: 3, pro_plus: 10, team_standard: 20, team_premium: Infinity, enterprise: Infinity
        },
        cloudComputeHours: {
            developer: 0, pro: 10, pro_plus: 50, team_standard: 25, team_premium: 120, enterprise: null
        },
        monthlyCredits: {
            developer: 0, pro: 20, pro_plus: 70, team_standard: 40, team_premium: 200, enterprise: null
        }
    };

    const limit = limits[feature]?.[tier];
    if (limit === null) return true; // unlimited/custom
    if (limit === 0) return false;
    return limit;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);

subscriptionSchema.statics.tierConfigs = {
    developer: {
        amount: 0, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: 0, cloudComputeHours: 0, maxConcurrentJobs: 0, taskTimeout: 5,
        maxDebugHostRooms: 0, maxDebugParticipants: 0, maxDeployments: 1,
        specEngineLevel: 'read_only', webrtcEnabled: false, dataRetentionDays: 7,
        features: { localModels: true, webcontainers: true, cloudAgents: false }
    },
    pro: {
        amount: 20, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: 20, cloudComputeHours: 10, maxConcurrentJobs: 1, taskTimeout: 15,
        maxDebugHostRooms: 1, maxDebugParticipants: 2, maxDeployments: 3,
        specEngineLevel: 'full_sdd', webrtcEnabled: true, dataRetentionDays: 14,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true }
    },
    pro_plus: {
        amount: 60, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: 70, cloudComputeHours: 50, maxConcurrentJobs: 3, taskTimeout: 30,
        maxDebugHostRooms: 3, maxDebugParticipants: 4, maxDeployments: 10,
        specEngineLevel: 'realtime_drift', webrtcEnabled: true, dataRetentionDays: 30,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, realtimeDrift: true }
    },
    team_standard: {
        amount: 40, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: 40, cloudComputeHours: 25, maxConcurrentJobs: 2, taskTimeout: 30,
        maxDebugHostRooms: Infinity, maxDebugParticipants: 4, maxDeployments: 20,
        specEngineLevel: 'team_library', webrtcEnabled: true, dataRetentionDays: 30,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true }
    },
    team_premium: {
        amount: 120, interval: 'monthly', currency: 'USD',
        monthlyCreditLimit: 200, cloudComputeHours: 120, maxConcurrentJobs: 5, taskTimeout: 60,
        maxDebugHostRooms: Infinity, maxDebugParticipants: 8, maxDeployments: Infinity,
        specEngineLevel: 'cross_repo', webrtcEnabled: true, dataRetentionDays: 90,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true, crossRepo: true, sso: false }
    },
    enterprise: {
        amount: null, interval: 'custom', currency: 'USD',
        monthlyCreditLimit: null, cloudComputeHours: null, maxConcurrentJobs: null, taskTimeout: null,
        maxDebugHostRooms: Infinity, maxDebugParticipants: Infinity, maxDeployments: Infinity,
        specEngineLevel: 'custom', webrtcEnabled: true, dataRetentionDays: Infinity,
        features: { localModels: true, webcontainers: true, cloudAgents: true, debugRooms: true, teamLibrary: true, rbac: true, crossRepo: true, sso: true, audit: true, scim: true }
    }
};
