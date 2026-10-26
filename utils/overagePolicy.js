/**
 * Compute-overage policy (decision 2026-10-25).
 *
 * Rate: 100 minor units (USD $1.00) per compute hour. This matches the
 * Pro → Pro+ marginal compute rate and Team Premium's $120/120h.
 * Billing is opt-in only; the monthly cap defaults to $50.
 */
function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR = nonNegativeNumber(
  process.env.COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR,
  100
);

const DEFAULT_COMPUTE_OVERAGE_CAP_MINOR = nonNegativeNumber(
  process.env.COMPUTE_OVERAGE_MONTHLY_CAP_MINOR,
  5000
);

function overageChargeMinor({ hours, priorAmountMinor, enabled, capMinor }) {
  if (!enabled || !hours || hours <= 0) {
    return { amountMinor: 0, capped: false };
  }
  const rate = COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR;
  const cap = nonNegativeNumber(capMinor, DEFAULT_COMPUTE_OVERAGE_CAP_MINOR);
  const available = Math.max(0, cap - Math.max(0, Number(priorAmountMinor) || 0));
  const requested = Math.round(hours * rate);
  return {
    amountMinor: Math.min(requested, available),
    capped: requested > available,
  };
}

module.exports = {
  COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR,
  DEFAULT_COMPUTE_OVERAGE_CAP_MINOR,
  overageChargeMinor,
};
