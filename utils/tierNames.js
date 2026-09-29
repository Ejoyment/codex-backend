/**
 * Canonical pricing tiers for BuildrsHQ.
 * The ONLY valid tiers are the six from the pricing blueprint:
 *   developer (free), pro, pro_plus, team_standard, team_premium, enterprise
 * Legacy tier names (freebie, starter, professional, ...) are normalized
 * to their canonical equivalent so older documents and webhook payloads
 * keep working after the tier migration.
 */

const TIERS = ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];

const LEGACY_TIER_MAP = {
  freebie: 'developer',
  starter: 'developer',
  trial: 'developer',
  free: 'developer',
  basic: 'developer',
  hobby: 'developer',
  professional: 'pro',
  business: 'enterprise',
  team: 'enterprise',
};

function canonicalTier(tier) {
  const t = String(tier == null ? '' : tier).trim().toLowerCase();
  if (TIERS.includes(t)) return t;
  return LEGACY_TIER_MAP[t] || 'developer';
}

function isPaidTier(tier) {
  return canonicalTier(tier) !== 'developer';
}

module.exports = { TIERS, LEGACY_TIER_MAP, canonicalTier, isPaidTier };
