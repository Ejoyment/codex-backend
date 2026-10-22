// Canonical self-serve pricing, derived from Subscription.tierConfigs so the
// checkout routes and the schedulers cannot drift apart. Amounts in
// tierConfigs are dollars; provider APIs expect cents.
const Subscription = require('../models/Subscription');

const PAID_TIERS = new Set(['pro', 'pro_plus', 'team_standard', 'team_premium']);
const DEFAULT_TIER = 'pro';

function planAmount(tier) {
    const config = Subscription.tierConfigs[tier] || Subscription.tierConfigs[DEFAULT_TIER];
    return config.amount;
}

function planAmountCents(tier) {
    return Math.round(planAmount(tier) * 100);
}

module.exports = { PAID_TIERS, DEFAULT_TIER, planAmount, planAmountCents };
