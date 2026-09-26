const mongoose = require('mongoose');

const entitlementSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    plan: {
        type: String,
        enum: ['free', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'],
        default: 'free'
    },
    provider: {
        type: String,
        enum: ['stripe', 'paystack', 'flutterwave', 'manual'],
        default: 'stripe'
    },
    providerRef: String,
    status: {
        type: String,
        enum: ['active', 'past_due', 'canceled'],
        default: 'active'
    },
    currentPeriodEnd: Date,
    lastEventId: String,
    creditsRemaining: { type: Number, default: 0 },
    computeHoursRemaining: { type: Number, default: 0 },
    seatCount: { type: Number, default: 1 },
    // Pay-as-you-go
    allowOverage: { type: Boolean, default: false },
    overageRatePerToken: { type: Number, default: 0 },
    // Team
    teamPooledCredits: { type: Number, default: 0 },
    teamMemberCreditsUsed: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        creditsUsed: { type: Number, default: 0 },
        computeUsed: { type: Number, default: 0 }
    }],
    // Regional pricing
    currency: { type: String, default: 'USD' },
    country: { type: String, default: '' },
    // Billing history
    lastBillingEvent: Date,
    failedPayments: { type: Number, default: 0 },
    gracePeriodEndsAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

entitlementSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

entitlementSchema.index({ userId: 1, status: 1 });
entitlementSchema.index({ teamId: 1 });

module.exports = mongoose.model('Entitlement', entitlementSchema);
