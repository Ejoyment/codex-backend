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
        enum: ['starter', 'freebie', 'professional', 'enterprise'],
        default: 'starter'
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'trial', 'past_due'],
        default: 'trial'
    },
    // Trial billing fields
    trialStartedAt: {
        type: Date,
        default: Date.now
    },
    trialEndsAt: Date,
    isTrialWithCard: {
        type: Boolean,
        default: false
    },
    cardAddedAt: Date,
    firstChargeAt: Date,
    firstChargeCompleted: {
        type: Boolean,
        default: false
    },
    nextBillingDate: Date,
    billingCycle: {
        type: Number,
        default: 0 // 0 = not started, 1 = first charge, 2 = second charge (2 months), 3+ = monthly
    },
    // Feature flags matching pricing.html plans
    features: {
        // STARTER (Free Trial) — matches pricing.html STARTER plan
        maxProjects: { type: Number, default: 10 }, // Up to 10 projects
        basicAiAssistance: { type: Boolean, default: true }, // Basic AI assistance
        communitySupport: { type: Boolean, default: true }, // Community support
        limitedApiAccess: { type: Boolean, default: true }, // Limited API access
        supportResponseHours: { type: Number, default: 48 }, // 48-hour support response
        // FREEBIE / legacy
        localRepositories: { type: Boolean, default: true },
        discordSync: { type: Boolean, default: true },
        // PROFESSIONAL
        advancedAnalytics: { type: Boolean, default: false },
        advancedAiAssistance: { type: Boolean, default: false }, // Advanced AI features
        aiCodeReview: { type: Boolean, default: false },
        fullApiAccess: { type: Boolean, default: false },
        prioritySupport: { type: Boolean, default: false },
        teamCollaboration: { type: Boolean, default: false },
        customIntegrations: { type: Boolean, default: false },
        unlimitedProjects: { type: Boolean, default: false },
        supportResponseHoursPro: { type: Number, default: 24 }, // 24-hour support response
        // ENTERPRISE
        soc2Compliance: { type: Boolean, default: false },
        dedicatedSupport: { type: Boolean, default: false },
        videoStandups: { type: Boolean, default: false },
        collaborativeEditing: { type: Boolean, default: false },
        ssoAuthentication: { type: Boolean, default: false },
        customContracts: { type: Boolean, default: false },
        slaAgreement: { type: Boolean, default: false },
        oneHourSupport: { type: Boolean, default: false }
    },
    pricing: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' },
        interval: { type: String, enum: ['monthly', 'yearly', 'custom', 'trial'], default: 'trial' }
    },
    paymentProvider: {
        type: String,
        enum: ['stripe', 'paystack', 'flutterwave', 'manual'],
        default: 'manual'
    },
    paymentId: String,
    customerId: String,
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: Date,
    cancelledAt: Date,
    metadata: {
        teamSize: Number,
        companyName: String,
        accountManager: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
subscriptionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Method to check if user has access to a feature
subscriptionSchema.methods.hasFeature = function(featureName) {
    return this.features[featureName] === true;
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

// Method to upgrade subscription
subscriptionSchema.methods.upgradeTo = function(tier) {
    const tiers = {
        starter: {
            amount: 50, // Starter plan $50/month
            interval: 'trial',
            features: {
                maxProjects: 10,
                basicAiAssistance: true,
                communitySupport: true,
                limitedApiAccess: true,
                supportResponseHours: 48,
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: false,
                advancedAiAssistance: false,
                aiCodeReview: false,
                fullApiAccess: false,
                prioritySupport: false,
                teamCollaboration: false,
                customIntegrations: false,
                unlimitedProjects: false,
                supportResponseHoursPro: 24,
                soc2Compliance: false,
                dedicatedSupport: false,
                videoStandups: false,
                collaborativeEditing: false,
                ssoAuthentication: false,
                customContracts: false,
                slaAgreement: false,
                oneHourSupport: false
            }
        },
        freebie: {
            amount: 0,
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
                unlimitedProjects: false,
                supportResponseHoursPro: 24,
                soc2Compliance: false,
                dedicatedSupport: false,
                videoStandups: false,
                collaborativeEditing: false,
                ssoAuthentication: false,
                customContracts: false,
                slaAgreement: false,
                oneHourSupport: false
            }
        },
        professional: {
            amount: 99,
            interval: 'monthly',
            features: {
                maxProjects: 0, // 0 = unlimited
                unlimitedProjects: true,
                basicAiAssistance: true,
                advancedAiAssistance: true,
                aiCodeReview: true,
                communitySupport: false,
                prioritySupport: true,
                limitedApiAccess: false,
                fullApiAccess: true,
                supportResponseHours: 24,
                supportResponseHoursPro: 24,
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: true,
                teamCollaboration: true,
                customIntegrations: true,
                soc2Compliance: false,
                dedicatedSupport: false,
                videoStandups: true,
                collaborativeEditing: true,
                ssoAuthentication: false,
                customContracts: false,
                slaAgreement: false,
                oneHourSupport: false
            }
        },
        enterprise: {
            amount: 299,
            interval: 'monthly',
            features: {
                maxProjects: 0, // 0 = unlimited
                unlimitedProjects: true,
                basicAiAssistance: true,
                advancedAiAssistance: true,
                aiCodeReview: true,
                communitySupport: false,
                prioritySupport: true,
                limitedApiAccess: false,
                fullApiAccess: true,
                supportResponseHours: 1,
                supportResponseHoursPro: 1,
                oneHourSupport: true,
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: true,
                teamCollaboration: true,
                customIntegrations: true,
                soc2Compliance: true,
                dedicatedSupport: true,
                videoStandups: true,
                collaborativeEditing: true,
                ssoAuthentication: true,
                customContracts: true,
                slaAgreement: true,
                dedicatedAccountManager: true
            }
        }
    };

    const tierConfig = tiers[tier];
    if (tierConfig) {
        this.tier = tier;
        this.features = { ...this.features, ...tierConfig.features };
        if (tierConfig.amount !== undefined) {
            this.pricing.amount = tierConfig.amount;
        }
        if (tierConfig.interval) {
            this.pricing.interval = tierConfig.interval;
        }
    }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);