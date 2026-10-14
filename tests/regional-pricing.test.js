/**
 * Regional pricing table (decisions 3.5/3.6): docs/regionalPricing.json.
 *
 * - Loader validates shape fail-fast (never a 500 at checkout).
 * - resolvePrice: tier row + currency, else standard USD (teams, unlisted).
 * - Gateway map overrides the hardcoded router; flutterwave_global resolves
 *   to the flutterwave adapter.
 */
const { loadTable, clearPricingCache, resolvePrice, gatewayFor } = require('../config/regionalPricing');
const { routeProvider, getAdapter } = require('../server/services/billing/paymentRouter');

afterEach(() => {
  clearPricingCache();
});

describe('loader validation', () => {
  test('committed table loads', () => {
    const table = loadTable();
    expect(Object.keys(table.pricing_tiers)).toEqual(expect.arrayContaining(['pro', 'pro_plus']));
    expect(table.gateways.NGN).toBe('paystack');
  });
});

describe('resolvePrice', () => {
  test('table row + currency wins', () => {
    expect(resolvePrice('pro', 'NGN')).toEqual(expect.objectContaining({
      amount: 21500, currency: 'NGN', interval: 'monthly', rail: 'paystack', adapter: 'paystack',
    }));
    expect(resolvePrice('pro_plus', 'KES').amount).toBe(6250);
  });

  test('USD resolves to the global rail', () => {
    const r = resolvePrice('pro', 'USD');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe(20);
    expect(r.rail).toBe('flutterwave_global');
    expect(r.adapter).toBe('flutterwave');
  });

  test('team tiers fall back to standard USD', () => {
    const r = resolvePrice('team_standard', 'NGN');
    expect(r.currency).toBe('USD');
    expect(r.adapter).toBe('flutterwave');
  });

  test('unlisted currency falls back to USD, never 400-shaped', () => {
    const r = resolvePrice('pro', 'MAD');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe(20);
  });

  test('unknown tier has no base amount (route fills from its own table)', () => {
    expect(resolvePrice('nope', 'NGN').amount).toBe(null);
  });
});

describe('gateway + router override', () => {
  test('file map wins per currency', () => {
    expect(gatewayFor('NGN')).toBe('paystack');
    expect(gatewayFor('GHS')).toBe('flutterwave');
    expect(gatewayFor('KES')).toBe('flutterwave');
    expect(gatewayFor('ZAR')).toBe('flutterwave');
  });

  test('routeProvider follows the file, not the hardcoded set', () => {
    expect(routeProvider({ currency: 'NGN' })).toBe('paystack');
    expect(routeProvider({ currency: 'GHS' })).toBe('flutterwave');
    expect(routeProvider({ currency: 'USD' })).toBe('flutterwave');
    expect(routeProvider({})).toBe('flutterwave');
    expect(routeProvider({ country: 'NG' })).toBe('paystack');
  });

  test('flutterwave_global resolves to the flutterwave adapter', () => {
    expect(getAdapter('flutterwave_global').name).toBe('flutterwave');
  });
});
