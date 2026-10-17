/**
 * Phase 3 — entitlementService: Entitlement is the single source of truth.
 * Updated ONLY via verified, idempotent webhooks (dedupe by event ID).
 */
const Entitlement = require('../../models/EntitlementModel');
const { canonicalTier } = require('../../../utils/tierNames');
const { TIERS } = require('../../../utils/tierNames');

async function getOrCreateEntitlement(userId) {
  let e = await Entitlement.findOne({ userId });
  if (!e) {
    e = await Entitlement.create({ userId });
  }
  return e;
}

// Read path for access decisions — never queries provider state.
async function getEntitlement(userId) {
  return getOrCreateEntitlement(userId);
}

/**
 * Write-through bridge (billing decision 3.1): every gate in the app reads
 * legacy Subscription, so canonical Entitlement writes must mirror
 * tier/status/provider there. Subscription stays the short-term read truth;
 * Entitlement stays the webhook truth. The bridge must NEVER break the
 * canonical write — failures are logged and swallowed.
 */
async function mirrorToSubscription(userId, { plan, status, provider, customerId } = {}) {
    try {
        const Subscription = require('../../../models/Subscription');
        const update = {};
        if (plan && TIERS.includes(plan)) update.tier = plan;
        if (status) update.status = status;
        if (customerId) update.customerId = String(customerId);
        if (Object.keys(update).length === 0) return null;
        if (provider) update.paymentProvider = provider;
        return await Subscription.findOneAndUpdate({ userId }, update, { new: true });
    } catch (error) {
        console.error('Entitlement→Subscription bridge failed:', error.message);
        return null;
    }
}
/**
 * Apply a verified webhook event idempotently.
 * Returns { applied, entitlement, reason? } — replays and unmapped types
 * report applied:false (the route answers 200 with current state; providers
 * retry non-2xx, so 409s and silent burials are both wrong).
 */
async function applyWebhookEvent(normalized) {
  const { eventId, userId: rawUserId, plan, status, provider, customerId, subscriptionId, currency, type } = normalized;
  if (!eventId) throw new Error('eventId required');
  let userId = rawUserId;
  if (!userId && customerId) {
    // Subscription/Invoice events carry no metadata: resolve the owner via a
    // previously stored provider customer id instead of failing the webhook.
    const prior = await Entitlement.findOne({ providerCustomerId: String(customerId) }).select('userId');
    if (prior) userId = prior.userId;
  }
  if (!userId) throw new Error('userId required (must be in webhook metadata)');
  // Ensure the row exists, then guard the mutation atomically: concurrent
  // deliveries of the same eventId must not both apply.
  await Entitlement.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });
  const set = {};
  if (plan) {
    try {
      set.plan = canonicalTier(plan);
    } catch {
      // Unknown plan slug: keep current plan, still record the event below.
    }
  }
  if (provider) set.provider = provider;
  if (customerId) set.providerCustomerId = String(customerId);
  if (subscriptionId) set.providerSubscriptionId = String(subscriptionId);
  if (currency) set.currency = String(currency).toUpperCase();
  const update = { $addToSet: { appliedEventIds: eventId } };
  if (Object.keys(set).length > 0) update.$set = set;
  const entitlement = await Entitlement.findOneAndUpdate(
    { userId, appliedEventIds: { $ne: eventId } },
    update,
    { new: true }
  );
  if (!entitlement) {
    const current = await Entitlement.findOne({ userId });
    return { applied: false, entitlement: current, reason: 'duplicate event' };
  }
  if (!status) {
    // Unmapped type (refunds, disputes, misc): visible no-op, NOT a silent
    // success. Whether these deactivate access is a billing-policy decision.
    await mirrorToSubscription(userId, { plan: set.plan, provider, customerId });
    return { applied: false, entitlement, reason: `unmapped event type: ${type || 'unknown'}` };
  }
  entitlement.status = status;
  await entitlement.save();
  await mirrorToSubscription(userId, { plan: set.plan, status, provider, customerId });
  return { applied: true, entitlement };
}

async function markCancelled(userId, { atPeriodEnd = true } = {}) {
  const entitlement = await getOrCreateEntitlement(userId);
  entitlement.cancelAtPeriodEnd = !!atPeriodEnd;
  if (!atPeriodEnd) entitlement.status = 'cancelled';
  await entitlement.save();
  await mirrorToSubscription(userId, {
    status: atPeriodEnd ? undefined : 'cancelled',
    provider: entitlement.provider,
  });
  return entitlement;
}

module.exports = { getOrCreateEntitlement, getEntitlement, applyWebhookEvent, markCancelled };
