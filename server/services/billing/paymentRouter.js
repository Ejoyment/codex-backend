/**
 * Phase 3 — paymentRouter: route by user country/currency.
 * The docs/regionalPricing.json gateway map wins (decisions 3.5/3.6);
 * Stripe is retired as a rail (kept as a getAdapter case for legacy reads).
 */
const { StripeAdapter } = require('./adapters/stripe');
const { PaystackAdapter } = require('./adapters/paystack');
const { FlutterwaveAdapter } = require('./adapters/flutterwave');

const AFRICAN_CURRENCIES = new Set([
  'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'RWF', 'XOF', 'XAF', 'EGP', 'MAD', 'ETB', 'ZMW',
]);
const AFRICAN_COUNTRIES = new Set([
  'NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'SN', 'CI', 'CM', 'EG', 'MA', 'ET', 'ZM',
]);

// Resolve a file gateway rail to an adapter name (flutterwave_global is the
// same v3 API as flutterwave).
function adapterForRail(rail) {
  if (rail === 'flutterwave_global') return 'flutterwave';
  return rail;
}

function routeProvider({ country, currency } = {}) {
  const cur = String(currency || '').toUpperCase();
  const cty = String(country || '').toUpperCase();
  try {
    const pricing = require('../../../config/regionalPricing');
    const table = pricing.loadTable();
    if (table.gateways[cur]) return adapterForRail(table.gateways[cur]);
    if (AFRICAN_CURRENCIES.has(cur) || AFRICAN_COUNTRIES.has(cty)) {
      return adapterForRail(table.fallback_rail || 'paystack');
    }
    const unlisted = table.unlisted_fallback || {};
    return adapterForRail(unlisted.rail || table.gateways.USD || 'paystack');
  } catch {
    // Unreadable table must not take checkout down: legacy behavior.
    if (AFRICAN_CURRENCIES.has(cur) || AFRICAN_COUNTRIES.has(cty)) {
      return 'paystack';
    }
    return 'stripe';
  }
}

function getAdapter(name) {
  switch (name) {
    case 'stripe':
      return new StripeAdapter();
    case 'paystack':
      return new PaystackAdapter();
    case 'flutterwave':
    case 'flutterwave_global':
      return new FlutterwaveAdapter();
    default:
      throw new Error(`Unknown payment provider: ${name}`);
  }
}

module.exports = { routeProvider, getAdapter, AFRICAN_CURRENCIES, AFRICAN_COUNTRIES };
