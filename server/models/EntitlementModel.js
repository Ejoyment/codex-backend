const mongoose = require('mongoose');

// Phase 3 — Entitlement: single source of truth for plan/status.
// Updated ONLY via verified, idempotent webhooks (dedupe by event ID).
// The app must read entitlements only — never query provider state directly
// for access decisions.

const entitlementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: {
      type: String,
      enum: ['starter', 'freebie', 'professional', 'enterprise'],
      default: 'starter',
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'trial',
    },
    provider: {
      type: String,
      enum: ['stripe', 'paystack', 'flutterwave', 'manual', null],
      default: null,
    },
    providerCustomerId: { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
    currency: { type: String, default: 'USD' },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    // Idempotency: every applied webhook event ID is recorded.
    appliedEventIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

entitlementSchema.index({ status: 1 });

// Access decisions read ONLY this record.
entitlementSchema.methods.isActive = function () {
  if (this.status === 'active') return true;
  if (this.status === 'trial') return true;
  return false;
};

module.exports = mongoose.model('Entitlement', entitlementSchema);
