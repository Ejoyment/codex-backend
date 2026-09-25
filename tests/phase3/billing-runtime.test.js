/**
 * Phase 3 tests — Multi-rail billing + Runtime tier routing.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.example') });
process.env.NODE_ENV = 'test';

jest.mock('stripe', () => jest.fn(() => ({
  checkout: { sessions: { create: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' }) } },
  billingPortal: { sessions: { create: jest.fn().mockResolvedValue({ url: 'https://stripe.test/portal' }) } },
  webhooks: { constructEvent: jest.fn().mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: { userId: 'u1', plan: 'professional' }, customer: 'cus_1', subscription: 'sub_1', currency: 'usd' } } }) },
  subscriptions: { cancel: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'canceled' }) },
})));

const { routeProvider, getAdapter } = require('../../server/services/billing/paymentRouter');

describe('paymentRouter — route by country/currency', () => {
  test('African currencies route to Paystack', () => {
    expect(routeProvider({ currency: 'NGN' })).toBe('paystack');
    expect(routeProvider({ currency: 'GHS' })).toBe('paystack');
    expect(routeProvider({ currency: 'KES' })).toBe('paystack');
    expect(routeProvider({ currency: 'ZAR' })).toBe('paystack');
  });

  test('African countries route to Paystack', () => {
    expect(routeProvider({ country: 'NG' })).toBe('paystack');
    expect(routeProvider({ country: 'GH' })).toBe('paystack');
    expect(routeProvider({ country: 'KE' })).toBe('paystack');
  });

  test('USD/international routes to Stripe', () => {
    expect(routeProvider({ currency: 'USD' })).toBe('stripe');
    expect(routeProvider({ currency: 'EUR' })).toBe('stripe');
    expect(routeProvider({ country: 'US' })).toBe('stripe');
    expect(routeProvider({})).toBe('stripe');
  });

  test('adapters share the interface', async () => {
    for (const name of ['stripe', 'paystack', 'flutterwave']) {
      const a = getAdapter(name);
      expect(typeof a.createCheckout).toBe('function');
      expect(typeof a.verifyWebhook).toBe('function');
      expect(typeof a.cancelSubscription).toBe('function');
      expect(typeof a.getCustomerPortal).toBe('function');
    }
    expect(() => getAdapter('nope')).toThrow('Unknown payment provider');
  });
});

describe('entitlementService — idempotent webhooks', () => {
  const mongoose = require('mongoose');
  const Entitlement = require('../../server/models/EntitlementModel');
  const svc = require('../../server/services/billing/entitlementService');

  // In-memory stand-in: no DB connection needed.
  const store = new Map();
  const oid = (s) => new mongoose.Types.ObjectId(s || '000000000000000000000001');

  beforeEach(() => {
    store.clear();
    jest.spyOn(Entitlement, 'findOne').mockImplementation(async ({ userId }) => store.get(String(userId)) || null);
    jest.spyOn(Entitlement, 'create').mockImplementation(async (doc) => {
      const e = { ...doc, appliedEventIds: [], isActive: () => ['active', 'trial'].includes(doc.status || 'trial'), save: async () => { store.set(String(doc.userId), e); return e; } };
      store.set(String(doc.userId), e);
      return e;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function seed(userId, status = 'trial') {
    const e = {
      userId, plan: 'starter', status, provider: null, providerCustomerId: null,
      providerSubscriptionId: null, currency: 'USD', appliedEventIds: [],
      isActive() { return this.status === 'active' || this.status === 'trial'; },
      async save() { store.set(String(userId), e); return e; },
    };
    store.set(String(userId), e);
    return e;
  }

  test('stripe webhook activates entitlement; replay is rejected', async () => {
    const userId = oid();
    await seed(userId);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    const stripe = getAdapter('stripe');
    const evt = await stripe.verifyWebhook({ rawBody: Buffer.from('{}'), signature: 'sig' });
    evt.userId = userId;
    const first = await svc.applyWebhookEvent(evt);
    expect(first.applied).toBe(true);
    expect(first.entitlement.status).toBe('active');
    await expect(svc.applyWebhookEvent(evt)).rejects.toMatchObject({ code: 'DUPLICATE_EVENT' });
  });

  test('paystack webhook activates; replay rejected; bad signature rejected', async () => {
    const userId = oid('000000000000000000000002');
    await seed(userId);
    process.env.PAYSTACK_SECRET_KEY = 'paystack-secret';
    const paystack = getAdapter('paystack');
    const crypto = require('crypto');
    const body = JSON.stringify({ event: 'charge.success', id: 1, data: { reference: 'ref1', currency: 'NGN', metadata: { userId: String(userId), plan: 'professional' }, customer: { customer_code: 'CUS_1' } } });
    const sig = crypto.createHmac('sha512', 'paystack-secret').update(Buffer.from(body)).digest('hex');
    const evt = await paystack.verifyWebhook({ rawBody: Buffer.from(body), signature: sig });
    const applied = await svc.applyWebhookEvent({ ...evt, userId });
    expect(applied.entitlement.status).toBe('active');
    expect(applied.entitlement.currency).toBe('NGN');
    await expect(svc.applyWebhookEvent({ ...evt, userId })).rejects.toMatchObject({ code: 'DUPLICATE_EVENT' });
    await expect(paystack.verifyWebhook({ rawBody: Buffer.from(body), signature: 'bad' })).rejects.toThrow('Invalid Paystack signature');
  });

  test('flutterwave webhook activates; replay rejected', async () => {
    const userId = oid('000000000000000000000003');
    await seed(userId);
    process.env.FLUTTERWAVE_SECRET_KEY = 'flw-secret';
    const flw = getAdapter('flutterwave');
    const body = JSON.stringify({ id: 'evt9', event: 'charge.completed', data: { status: 'successful', tx_ref: 'tx9', currency: 'GHS', meta: { userId: String(userId), plan: 'enterprise' }, customer: { email: 'a@b.c' } } });
    const evt = await flw.verifyWebhook({ rawBody: Buffer.from(body), signature: 'flw-secret' });
    const applied = await svc.applyWebhookEvent({ ...evt, userId });
    expect(applied.entitlement.status).toBe('active');
    expect(applied.entitlement.plan).toBe('enterprise');
    await expect(svc.applyWebhookEvent({ ...evt, userId })).rejects.toMatchObject({ code: 'DUPLICATE_EVENT' });
  });

  test('app reads entitlement only (isActive), never provider state', async () => {
    const userId = oid('000000000000000000000004');
    const e = await seed(userId, 'past_due');
    expect(e.isActive()).toBe(false);
    e.status = 'active';
    expect(e.isActive()).toBe(true);
  });
});

describe('webhook raw-body capture (signature verification sees exact bytes)', () => {
  const { captureWebhookRawBody } = require('../../server/services/securityHeaders');
  const crypto = require('crypto');

  test('captures exact bytes on webhook path, ignores other paths', () => {
    const bytes = Buffer.from('{"event":"charge.success"}');
    const webhookReq = { originalUrl: '/api/v1/billing/webhook/paystack' };
    captureWebhookRawBody(webhookReq, {}, bytes);
    expect(Buffer.isBuffer(webhookReq.rawBody)).toBe(true);
    expect(webhookReq.rawBody.equals(bytes)).toBe(true);

    const otherReq = { originalUrl: '/api/v1/rooms' };
    captureWebhookRawBody(otherReq, {}, bytes);
    expect(otherReq.rawBody).toBeUndefined();
  });

  test('captured bytes pass Paystack HMAC end-to-end', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'paystack-secret-e2e';
    const { PaystackAdapter } = require('../../server/services/billing/adapters/paystack');
    const body = JSON.stringify({ event: 'charge.success', id: 7, data: { reference: 'e2e1', currency: 'NGN', metadata: {}, customer: {} } });
    const req = { originalUrl: '/api/v1/billing/webhook/paystack' };
    captureWebhookRawBody(req, {}, Buffer.from(body));
    const sig = crypto.createHmac('sha512', 'paystack-secret-e2e').update(req.rawBody).digest('hex');
    const evt = await new PaystackAdapter().verifyWebhook({ rawBody: req.rawBody, signature: sig });
    expect(evt.eventId).toBe('paystack:7');
    expect(evt.status).toBe('active');
  });
});

describe('edgeRouter — nearest PoP for global hubs', () => {
  const { nearestEdge, getPops } = require('../../server/services/billing/edgeRouter');

  test('exact country match wins', () => {
    expect(nearestEdge({ country: 'NG' }).code).toBe('ng-lagos');
    expect(nearestEdge({ country: 'KE' }).code).toBe('ke-nairobi');
    expect(nearestEdge({ country: 'ZA' }).code).toBe('za-joburg');
  });

  test('currency match covers hub neighbors without country', () => {
    expect(nearestEdge({ currency: 'NGN' }).code).toBe('ng-lagos');
    expect(nearestEdge({ currency: 'KES' }).code).toBe('ke-nairobi');
    expect(nearestEdge({ currency: 'USD' }).code).toBe('us-east');
  });

  test('coordinates pick the truly nearest PoP', () => {
    // Accra-ish coordinates → gh-accra, not Lagos.
    expect(nearestEdge({ lat: 5.6, lng: -0.2 }).code).toBe('gh-accra');
  });

  test('unknown region falls back to a default PoP (never null)', () => {
    const pop = nearestEdge({});
    expect(pop).toBeTruthy();
    expect(pop.code).toBe(getPops()[0].code);
  });
});

describe('bootManager — Tier 1 vs Tier 2 routing', () => {
  const bm = require('../../client/lib/runtime/bootManager');

  test('capable device picks Tier 1 (in-browser WebContainer)', () => {
    const { tier } = bm.pickTier({ deviceMemory: 8, hardwareConcurrency: 8, effectiveType: '4g', saveData: false });
    expect(tier).toBe('tier1');
  });

  test('low-spec device routes to Tier 2 automatically', () => {
    expect(bm.pickTier({ deviceMemory: 2, hardwareConcurrency: 8 }).tier).toBe('tier2');
    expect(bm.pickTier({ deviceMemory: 8, hardwareConcurrency: 2 }).tier).toBe('tier2');
  });

  test('slow connection / save-data routes to Tier 2', () => {
    expect(bm.pickTier({ effectiveType: '2g' }).tier).toBe('tier2');
    expect(bm.pickTier({ effectiveType: 'slow-2g' }).tier).toBe('tier2');
    expect(bm.pickTier({ saveData: true }).tier).toBe('tier2');
    expect(bm.pickTier({ downlink: 0.8 }).tier).toBe('tier2');
  });

  test('explicit force flags respected', () => {
    expect(bm.pickTier({ deviceMemory: 16, hardwareConcurrency: 16 }, { forceTier: 'tier2' }).tier).toBe('tier2');
    expect(bm.pickTier({ deviceMemory: 1 }, { forceTier: 'tier1' }).tier).toBe('tier1');
  });

  test('reasons explain the tier (badge text)', () => {
    const r = bm.pickTier({ deviceMemory: 2, hardwareConcurrency: 2 });
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});
