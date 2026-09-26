/**
 * Phase 3 — paymentRouter: route by user country/currency.
 * Paystack/Flutterwave for African markets, Stripe for USD/international.
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

function routeProvider({ country, currency } = {}) {
  const cur = String(currency || '').toUpperCase();
  const cty = String(country || '').toUpperCase();
  if (AFRICAN_CURRENCIES.has(cur) || AFRICAN_COUNTRIES.has(cty)) {
    // Default African rail: Paystack; Flutterwave chosen explicitly via `provider` hint.
    return 'paystack';
  }
  return 'stripe';
}

function getAdapter(name) {
  switch (name) {
    case 'stripe':
      return new StripeAdapter();
    case 'paystack':
      return new PaystackAdapter();
    case 'flutterwave':
      return new FlutterwaveAdapter();
    default:
      throw new Error(`Unknown payment provider: ${name}`);
  }
}

module.exports = { routeProvider, getAdapter, AFRICAN_CURRENCIES, AFRICAN_COUNTRIES };
