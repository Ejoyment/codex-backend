const mongoose = require('mongoose');

const entitlementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    plan: {
      type: String,
      enum: ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'],
      default: 'developer',
    },
    status: {
      type: String,
      enum: ['active', 'trial', 'past_due', 'cancelled', 'expired'],
      default: 'active',
    },
    provider: {
      type: String,
      enum: ['stripe', 'paystack', 'flutterwave', 'manual'],
      default: 'stripe',
    },
    providerRef: String,
    currency: { type: String, default: 'USD' },
    country: { type: String, default: '' },
    currentPeriodEnd: { type: Date, default: null },
    lastEventId: { type: String, default: null },
    creditsRemaining: { type: Number, default: 0 },
    computeHoursRemaining: { type: Number, default: 0 },
    seatCount: { type: Number, default: 1 },
    allowOverage: { type: Boolean, default: false },
    overageRatePerToken: { type: Number, default: 0 },
    teamPooledCredits: { type: Number, default: 0 },
    teamMemberCreditsUsed: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      creditsUsed: { type: Number, default: 0 },
      computeUsed: { type: Number, default: 0 },
    }],
    failedPayments: { type: Number, default: 0 },
    gracePeriodEndsAt: { type: Date, default: null },
    appliedEventIds: { type: [String], default: [] },
    tierPricing: {
      monthlyCreditLimit: { type: Number, default: 0 },
      cloudComputeHours: { type: Number, default: 0 },
      maxConcurrentJobs: { type: Number, default: 0 },
      taskTimeoutMinutes: { type: Number, default: 5 },
      maxDebugHostRooms: { type: Number, default: 0 },
      maxDebugParticipants: { type: Number, default: 0 },
      maxDeployments: { type: Number, default: 1 },
      specEngineLevel: { type: String, enum: ['read_only', 'full_sdd', 'realtime_drift', 'team_library', 'cross_repo', 'custom'], default: 'read_only' },
      webrtcEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

entitlementSchema.index({ status: 1 });
entitlementSchema.index({ teamId: 1 });
entitlementSchema.index({ userId: 1, status: 1 });

entitlementSchema.methods.isActive = function () {
  return this.status === 'active' || this.status === 'trial';
};

module.exports = mongoose.model('Entitlement', entitlementSchema);
