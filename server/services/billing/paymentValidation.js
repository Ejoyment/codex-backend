const { resolvePrice, loadTable } = require('../../../config/regionalPricing');
const { canonicalTier } = require('../../../utils/tierNames');
const { PAID_TIERS, planAmount } = require('../../../utils/billingPricing');

const ACTIVATION_EVENTS = new Set([
  'charge.success',
  'charge.completed',
  'checkout.session.completed',
]);

function paidPlan(value) {
  if (!value) return null;
  const plan = canonicalTier(value);
  return PAID_TIERS.has(plan) ? plan : null;
}

function normalizeInterval(value) {
  const interval = String(value || '').toLowerCase();
  if (interval === 'year' || interval === 'annual' || interval === 'yearly') return 'yearly';
  if (interval === 'month' || interval === 'monthly') return 'monthly';
  return null;
}

function canonicalAmountsMinor(plan, currency, interval) {
  const cur = String(currency || '').toUpperCase();
  const priced = resolvePrice(plan, currency);
  // Team tiers have no regional row and checkout falls back to the standard
  // USD table, so use that same server-side amount rather than rejecting a
  // legitimate team payment.
  const amount = priced.amount != null ? priced.amount : planAmount(plan);
  const pricedCurrency = priced.amount != null ? priced.currency : 'USD';
  if (amount == null || pricedCurrency !== cur) return null;
  const monthlyMinor = Math.round(amount * 100);
  const yearlyMinor = Math.round(amount * (loadTable().annual_multiple || 10) * 100);
  const normalized = normalizeInterval(interval);
  if (normalized === 'monthly') return { currency: cur, amountsMinor: [monthlyMinor] };
  if (normalized === 'yearly') return { currency: cur, amountsMinor: [yearlyMinor] };
  return { currency: cur, amountsMinor: [monthlyMinor, yearlyMinor] };
}

function validateActivationPayment({ type, status, plan, storedPlan, currency, amountMinor, interval }) {
  if (status !== 'active') {
    return { ok: true, plan: paidPlan(plan) || paidPlan(storedPlan) };
  }
  const eventPlan = paidPlan(plan);
  const expectedPlan = eventPlan || paidPlan(storedPlan);
  if (!expectedPlan) {
    return { ok: false, reason: 'activation has no canonical paid plan' };
  }
  if (amountMinor == null) {
    if (ACTIVATION_EVENTS.has(type)) {
      return { ok: false, reason: 'activation is missing the paid amount' };
    }
    return { ok: true, plan: expectedPlan };
  }
  const paidMinor = Number(amountMinor);
  if (!Number.isInteger(paidMinor) || paidMinor <= 0) {
    return { ok: false, reason: 'activation has an invalid paid amount' };
  }
  const expected = canonicalAmountsMinor(expectedPlan, currency, interval);
  if (!expected) {
    return {
      ok: false,
      reason: `currency ${String(currency || 'missing').toUpperCase()} does not match canonical ${expectedPlan} pricing`,
    };
  }
  if (!expected.amountsMinor.includes(paidMinor)) {
    return {
      ok: false,
      reason: `paid amount ${paidMinor} ${expected.currency} does not match canonical ${expectedPlan} pricing`,
    };
  }
  return { ok: true, plan: expectedPlan };
}

module.exports = { paidPlan, canonicalAmountsMinor, validateActivationPayment };
