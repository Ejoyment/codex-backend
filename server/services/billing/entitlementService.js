/**
 * Phase 3 — entitlementService: Entitlement is the single source of truth.
 * Updated ONLY via verified, idempotent webhooks (dedupe by event ID).
 */
const Entitlement = require('../../models/EntitlementModel');

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
 * Apply a verified webhook event idempotently.
 * Returns { applied: boolean, entitlement } — replayed event IDs are rejected.
 */
async function applyWebhookEvent(normalized) {
  const { eventId, userId, plan, status, provider, customerId, subscriptionId, currency } = normalized;
  if (!eventId) throw new Error('eventId required');
  if (!userId) throw new Error('userId required (must be in webhook metadata)');
  const entitlement = await getOrCreateEntitlement(userId);
  if (entitlement.appliedEventIds.includes(eventId)) {
    const err = new Error('Duplicate webhook event');
    err.code = 'DUPLICATE_EVENT';
    throw err;
  }
  if (plan) entitlement.plan = plan;
  if (status) entitlement.status = status;
  if (provider) entitlement.provider = provider;
  if (customerId) entitlement.providerCustomerId = String(customerId);
  if (subscriptionId) entitlement.providerSubscriptionId = String(subscriptionId);
  if (currency) entitlement.currency = String(currency).toUpperCase();
  entitlement.appliedEventIds.push(eventId);
  // Cap stored event IDs to bound document growth.
  if (entitlement.appliedEventIds.length > 500) {
    entitlement.appliedEventIds = entitlement.appliedEventIds.slice(-500);
  }
  await entitlement.save();
  return { applied: true, entitlement };
}

async function markCancelled(userId, { atPeriodEnd = true } = {}) {
  const entitlement = await getOrCreateEntitlement(userId);
  entitlement.cancelAtPeriodEnd = !!atPeriodEnd;
  if (!atPeriodEnd) entitlement.status = 'cancelled';
  await entitlement.save();
  return entitlement;
}

module.exports = { getOrCreateEntitlement, getEntitlement, applyWebhookEvent, markCancelled };
