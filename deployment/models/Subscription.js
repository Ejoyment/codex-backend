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
        enum: ['freebie', 'professional', 'enterprise'],
        default: 'freebie'
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'trial'],
        default: 'active'
    },
    features: {
        localRepositories: { type: Boolean, default: true },
        discordSync: { type: Boolean, default: true },
        advancedAnalytics: { type: Boolean, default: false },
        aiCodeReview: { type: Boolean, default: false },
        soc2Compliance: { type: Boolean, default: false },
        dedicatedSupport: { type: Boolean, default: false },
        videoStandups: { type: Boolean, default: false },
        collaborativeEditing: { type: Boolean, default: false }
    },
    pricing: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' },
        interval: { type: String, enum: ['monthly', 'yearly', 'custom'], default: 'monthly' }
    },
    paymentProvider: {
        type: String,
        enum: ['stripe', 'paystack', 'manual'],
        default: 'manual'
    },
    paymentId: String,
    customerId: String,
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: Date,
    trialEndsAt: Date,
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

// Method to upgrade subscription
subscriptionSchema.methods.upgradeTo = function(tier) {
    const tiers = {
        freebie: {
            amount: 0,
            features: {
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: false,
                aiCodeReview: false,
                soc2Compliance: false,
                dedicatedSupport: false,
                videoStandups: false,
                collaborativeEditing: false
            }
        },
        professional: {
            amount: 25,
            features: {
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: true,
                aiCodeReview: true,
                soc2Compliance: false,
                dedicatedSupport: false,
                videoStandups: true,
                collaborativeEditing: true
            }
        },
        enterprise: {
            amount: 0, // Custom pricing
            features: {
                localRepositories: true,
                discordSync: true,
                advancedAnalytics: true,
                aiCodeReview: true,
                soc2Compliance: true,
                dedicatedSupport: true,
                videoStandups: true,
                collaborativeEditing: true
            }
        }
    };

    const tierConfig = tiers[tier];
    if (tierConfig) {
        this.tier = tier;
        this.features = tierConfig.features;
        this.pricing.amount = tierConfig.amount;
    }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
