/**
 * Regional pricing + gateway routing loader (decisions 3.5/3.6).
 *
 * Source: docs/regionalPricing.json (tracked — runtime code depends on it).
 * Validated once at load with a clear boot error on bad shape (never a 500
 * at checkout). Resolution rules, in order:
 *   1. Tier with no regional row (teams/enterprise) -> standard USD billing.
 *   2. Currency in the tier's regional_rates -> that amount + currency.
 *   3. Anything else -> USD fallback via the international processor.
 * Gateway aliases (e.g. flutterwave_global) resolve to adapter names; the
 * file map overrides the hardcoded router.
 */
const fs = require('fs');
const path = require('path');

const TABLE_PATH = path.join(__dirname, '..', 'docs', 'regionalPricing.json');

// Adapter names known to getAdapter().
const ADAPTER_ALIASES = {
  paystack: 'paystack',
  flutterwave: 'flutterwave',
  flutterwave_global: 'flutterwave',
  stripe: 'stripe',
};

let cached = null;

function loadTable() {
  if (cached) return cached;
  let raw;
  try {
    raw = fs.readFileSync(TABLE_PATH, 'utf8');
  } catch (error) {
    throw new Error(`Regional pricing table missing at docs/regionalPricing.json: ${error.message}`);
  }
  let table;
  try {
    table = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Regional pricing table is not valid JSON: ${error.message}`);
  }
  if (!table || typeof table !== 'object' || !table.pricing_tiers || typeof table.pricing_tiers !== 'object') {
    throw new Error('Regional pricing table must contain a pricing_tiers object.');
  }
  if (!table.gateways || typeof table.gateways !== 'object') {
    throw new Error('Regional pricing table must contain a gateways object.');
  }
  for (const [tier, row] of Object.entries(table.pricing_tiers)) {
    if (typeof row.base_usd !== 'number' || row.base_usd <= 0) {
      throw new Error(`Regional pricing: tier '${tier}' needs a positive base_usd.`);
    }
    if (row.interval !== undefined && row.interval !== 'monthly') {
      throw new Error(`Regional pricing: tier '${tier}' has unsupported interval '${row.interval}'.`);
    }
    if (row.regional_rates !== undefined && (typeof row.regional_rates !== 'object' || row.regional_rates === null)) {
      throw new Error(`Regional pricing: tier '${tier}' needs regional_rates as an object.`);
    }
    for (const [cur, rate] of Object.entries(row.regional_rates || {})) {
      if (typeof rate.amount !== 'number' || rate.amount <= 0) {
        throw new Error(`Regional pricing: tier '${tier}' currency '${cur}' needs a positive amount.`);
      }
    }
  }
  for (const [cur, rail] of Object.entries(table.gateways)) {
    if (!ADAPTER_ALIASES[rail]) {
      throw new Error(`Regional pricing: gateway '${rail}' for '${cur}' maps to no known adapter.`);
    }
  }
  if (table.annual_multiple !== undefined && !(typeof table.annual_multiple === 'number' && table.annual_multiple > 0)) {
    throw new Error('Regional pricing: annual_multiple must be a positive number.');
  }
  cached = table;
  return cached;
}

// Test helper: drop the cached table.
function clearPricingCache() {
  cached = null;
}

// Resolve { amount (major units), currency, interval, display, rail, adapter }
// for a tier + requested currency. Never throws for unknown inputs —
// teams/enterprise and unlisted currencies fall back to standard USD.
function resolvePrice(tier, currency) {
  const table = loadTable();
  const cur = String(currency || 'USD').toUpperCase();
  const row = table.pricing_tiers[tier] || null;
  const interval = (row && row.interval) || 'monthly';
  const rate = row && row.regional_rates && row.regional_rates[cur];
  if (rate) {
    return {
      amount: rate.amount,
      currency: cur,
      interval,
      display: rate.display_text || `${rate.amount} ${cur}`,
      rail: table.gateways[cur] || table.fallback_rail || 'paystack',
      adapter: ADAPTER_ALIASES[table.gateways[cur]] || 'paystack',
    };
  }
  const usd = table.unlisted_fallback && table.unlisted_fallback.currency
    ? table.unlisted_fallback.currency
    : 'USD';
  const usdRail = table.gateways[usd] || table.fallback_rail || 'paystack';
  const base = row ? row.base_usd : null;
  return {
    amount: base,
    currency: usd,
    interval,
    display: base ? `$${base}/mo` : 'USD standard billing',
    rail: usdRail,
    adapter: ADAPTER_ALIASES[usdRail] || 'paystack',
  };
}

function gatewayFor(currency) {
  const table = loadTable();
  const cur = String(currency || 'USD').toUpperCase();
  const rail = table.gateways[cur];
  if (rail && ADAPTER_ALIASES[rail]) return rail;
  return table.fallback_rail || 'paystack';
}

module.exports = { loadTable, clearPricingCache, resolvePrice, gatewayFor, TABLE_PATH };
