/**
 * Phase 3 — entitlementService: Entitlement is the single source of truth.
 * Updated ONLY via verified, idempotent webhooks (dedupe by event ID).
 */
const Entitlement = require('../../models/EntitlementModel');
const { canonicalTier } = require('../../../utils/tierNames');
const { TIERS } = require('../../../utils/tierNames');
const { validateActivationPayment } = require('./paymentValidation');
const { signEntitlement, verifyEntitlementSignature } = require('./entitlementSignature');

const MANUAL_ENTERPRISE_STATUSES = ['active', 'trial', 'past_due', 'cancelled', 'expired'];

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeUserId(value) {
  const userId = value == null ? '' : String(value).trim();
  if (!userId) throw validationError('userId is required');
  return userId;
}

function normalizeAmountMinor(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw validationError('amountMinor must be a non-negative integer in minor units');
  }
  return value;
}

function normalizeCurrency(value) {
  const currency = String(value == null ? '' : value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw validationError('currency must be a 3-letter ISO code');
  }
  return currency;
}

function normalizePeriodEnd(value) {
  if (value == null || value === '') throw validationError('currentPeriodEnd is required');
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError('currentPeriodEnd must be a valid date');
  }
  return date;
}

function normalizeManualStatus(value) {
  const status = value == null ? 'active' : String(value);
  if (!MANUAL_ENTERPRISE_STATUSES.includes(status)) {
    throw validationError(`status must be one of: ${MANUAL_ENTERPRISE_STATUSES.join(', ')}`);
  }
  return status;
}

async function findEntitlement(filter) {
  let query = Entitlement.findOne(filter);
  if (query && typeof query.select === 'function') {
    query = query.select('userId plan status currency appliedEventIds');
  }
  return query;
}

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

function toEntitlementView(entitlement) {
  if (!entitlement) return null;
  const manual = entitlement.provider === 'manual';
  return {
    userId: entitlement.userId == null ? null : String(entitlement.userId),
    teamId: entitlement.teamId == null ? null : String(entitlement.teamId),
    plan: entitlement.plan,
    status: entitlement.status,
    provider: entitlement.provider,
    currency: entitlement.currency,
    amountMinor: entitlement.amountMinor == null ? null : Number(entitlement.amountMinor),
    currentPeriodEnd: entitlement.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!entitlement.cancelAtPeriodEnd,
    active: typeof entitlement.isActive === 'function'
      ? entitlement.isActive()
      : (entitlement.status === 'active' || entitlement.status === 'trial'),
    manual,
    signatureVerified: manual ? verifyEntitlementSignature(entitlement) : null,
  };
}

async function getEntitlementView(userId) {
  const entitlement = await Entitlement.findOne({ userId: normalizeUserId(userId) });
  return toEntitlementView(entitlement);
}

/**
 * Provision or renew an enterprise entitlement outside a payment rail.
 * Consumer plan-price validation deliberately does NOT run here: the amount is
 * an admin-supplied contract value, stored in minor units and signed so later
 * reads can detect tampering.
 */
async function provisionManualEnterprise({
  userId,
  amountMinor,
  currency,
  currentPeriodEnd,
  status,
  teamId,
} = {}) {
  const normalized = {
    userId: normalizeUserId(userId),
    amountMinor: normalizeAmountMinor(amountMinor),
    currency: normalizeCurrency(currency),
    currentPeriodEnd: normalizePeriodEnd(currentPeriodEnd),
    status: normalizeManualStatus(status),
  };
  let entitlement = await Entitlement.findOne({ userId: normalized.userId });
  const resolvedTeamId = teamId !== undefined
    ? (teamId || null)
    : (entitlement ? entitlement.teamId : null);
  const signature = signEntitlement({
    ...normalized,
    teamId: resolvedTeamId,
    plan: 'enterprise',
    provider: 'manual',
  });
  if (!entitlement) entitlement = await Entitlement.create({ userId: normalized.userId });
  entitlement.plan = 'enterprise';
  entitlement.status = normalized.status;
  entitlement.provider = 'manual';
  entitlement.currency = normalized.currency;
  entitlement.amountMinor = normalized.amountMinor;
  entitlement.currentPeriodEnd = normalized.currentPeriodEnd;
  entitlement.teamId = resolvedTeamId;
  entitlement.cancelAtPeriodEnd = false;
  entitlement.providerSubscriptionId = null;
  entitlement.providerCustomerId = null;
  entitlement.entitlementSignature = signature;
  await entitlement.save();
  await mirrorManualEnterpriseToSubscription(normalized.userId, entitlement);
  return entitlement;
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
async function mirrorManualEnterpriseToSubscription(userId, entitlement) {
    try {
        const Subscription = require('../../../models/Subscription');
        return await Subscription.findOneAndUpdate(
            { userId },
            {
                tier: 'enterprise',
                status: entitlement.status,
                paymentProvider: 'manual',
                pricing: {
                    amount: Number(entitlement.amountMinor) / 100,
                    currency: entitlement.currency,
                    interval: 'custom',
                },
                endDate: entitlement.currentPeriodEnd,
                nextBillingDate: entitlement.currentPeriodEnd,
                cancelAtPeriodEnd: false,
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        console.error('Entitlement→Subscription manual mirror failed:', error.message);
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
  const { eventId, userId: rawUserId, plan, status, provider, customerId, subscriptionId, currency, amountMinor, amount, interval, type } = normalized;
  if (!eventId) throw new Error('eventId required');
  let userId = rawUserId;
  let prior = null;
  if (!userId && customerId) {
    // Subscription/Invoice events carry no metadata: resolve the owner via a
    // previously stored provider customer id instead of failing the webhook.
    prior = await findEntitlement({ providerCustomerId: String(customerId) });
    if (prior) userId = prior.userId;
  }
  if (!userId) throw new Error('userId required (must be in webhook metadata)');
  if (!prior) prior = await findEntitlement({ userId });
  if (prior && Array.isArray(prior.appliedEventIds) && prior.appliedEventIds.includes(eventId)) {
    await mirrorToSubscription(userId, {
      plan: prior.plan,
      status: prior.status,
      provider: prior.provider,
      customerId: prior.providerCustomerId,
    });
    return { applied: false, entitlement: prior, reason: 'duplicate event' };
  }
  const paidMinor = amountMinor != null
    ? Number(amountMinor)
    : (amount != null ? Math.round(Number(amount) * 100) : null);
  const validation = validateActivationPayment({
    type,
    status,
    plan,
    storedPlan: prior && prior.plan,
    currency,
    amountMinor: paidMinor,
    interval,
  });
  if (!validation.ok) {
    return { applied: false, entitlement: prior, reason: validation.reason };
  }
  // Ensure the row exists, then guard the mutation atomically: concurrent
  // deliveries of the same eventId must not both apply.
  await Entitlement.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });
  const set = {};
  if (status === 'active' && validation.plan) {
    set.plan = validation.plan;
  } else if (plan) {
    try {
      set.plan = canonicalTier(plan);
    } catch {
      // Unknown plan slug: keep current plan, still record the event below.
    }
  }
  if (provider) set.provider = provider;
  if (status) set.status = status;
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
    if (current) {
      await mirrorToSubscription(userId, {
        plan: current.plan,
        status: current.status,
        provider: current.provider,
        customerId: current.providerCustomerId,
      });
    }
    return { applied: false, entitlement: current, reason: 'duplicate event' };
  }
  if (!status) {
    // Unmapped type (refunds, disputes, misc): visible no-op, NOT a silent
    // success. Whether these deactivate access is a billing-policy decision.
    await mirrorToSubscription(userId, { plan: set.plan, provider, customerId });
    return { applied: false, entitlement, reason: `unmapped event type: ${type || 'unknown'}` };
  }
  await mirrorToSubscription(userId, { plan: set.plan, status, provider, customerId });
  return { applied: true, entitlement };
}

async function markCancelled(userId, { atPeriodEnd = true } = {}) {
  const entitlement = await getOrCreateEntitlement(userId);
  entitlement.cancelAtPeriodEnd = !!atPeriodEnd;
  if (!atPeriodEnd) entitlement.status = 'cancelled';
  if (entitlement.provider === 'manual' && entitlement.amountMinor != null) {
    try {
      entitlement.entitlementSignature = signEntitlement(entitlement);
    } catch (error) {
      // Cancellation must still succeed if the signing key is unavailable.
    }
  }
  await entitlement.save();
  await mirrorToSubscription(userId, {
    status: atPeriodEnd ? undefined : 'cancelled',
    provider: entitlement.provider,
  });
  return entitlement;
}

module.exports = {
  getOrCreateEntitlement,
  getEntitlement,
  getEntitlementView,
  provisionManualEnterprise,
  toEntitlementView,
  verifyEntitlementSignature,
  applyWebhookEvent,
  markCancelled,
};
