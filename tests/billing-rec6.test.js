/**
 * Billing decisions 3.1/3.2, Redis 3.7 (fallback paths), ban/export 3.10.
 *
 * - Canonical→Subscription write-through bridge (tier/status mirrored).
 * - Atomic webhook idempotency (duplicate → applied:false, no throw).
 * - userId fallback via providerCustomerId; unmapped types visible.
 * - markCancelled mirrors.
 * - Scheduler atomic claims (loser stands down).
 * - v1 checkout: client amount/URLs ignored (server table + fixed URLs).
 * - Ban: key gate, flag set, liveness rejects banned.
 * - Export: shape + exclusions.
 * - Redis helpers without REDIS_URL (fallbacks); limiter factory intact.
 *
 * No database, no network: models + adapters stubbed.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
delete process.env.REDIS_URL;
mongoose.set('bufferCommands', false);

jest.doMock('stripe', () => jest.fn(() => ({})));
jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { userId: '507f1f77bcf86cd799439011' };
    next();
  },
}));

const Entitlement = require('../server/models/EntitlementModel');
const Subscription = require('../models/Subscription');
const BillingSchedule = require('../models/BillingSchedule');
const User = require('../models/User');
const entitlementService = require('../server/services/billing/entitlementService');
const { isWebhookPath } = require('../utils/webhookSecurity');

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

describe('write-through bridge (3.1)', () => {
  const appliedDoc = (over = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    userId: '507f1f77bcf86cd799439011',
    plan: 'pro',
    status: 'active',
    save: jest.fn(async function () { return this; }),
    ...over,
  });

  test('applyWebhookEvent mirrors tier/status to Subscription', async () => {
    jest.spyOn(Entitlement, 'updateOne').mockResolvedValue({});
    const ent = appliedDoc();
    jest.spyOn(Entitlement, 'findOneAndUpdate').mockResolvedValue(ent);
    const mirror = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const res = await entitlementService.applyWebhookEvent({
      eventId: 'stripe:evt1',
      type: 'checkout.session.completed',
      userId: '507f1f77bcf86cd799439011',
      plan: 'pro',
      status: 'active',
      provider: 'stripe',
      customerId: 'cus_1',
    });
    expect(res.applied).toBe(true);
    expect(mirror).toHaveBeenCalledWith(
      { userId: '507f1f77bcf86cd799439011' },
      expect.objectContaining({ tier: 'pro', status: 'active' }),
      expect.anything()
    );
    expect(ent.status).toBe('active');
  });

  test('duplicate event returns applied:false instead of throwing', async () => {
    jest.spyOn(Entitlement, 'updateOne').mockResolvedValue({});
    jest.spyOn(Entitlement, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(Entitlement, 'findOne').mockResolvedValue(appliedDoc());
    const mirror = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const res = await entitlementService.applyWebhookEvent({
      eventId: 'stripe:evt1',
      type: 'checkout.session.completed',
      userId: '507f1f77bcf86cd799439011',
      plan: 'pro',
      status: 'active',
    });
    expect(res.applied).toBe(false);
    expect(res.reason).toMatch(/duplicate/i);
    expect(mirror).not.toHaveBeenCalled();
  });

  test('missing userId resolves via providerCustomerId', async () => {
    jest.spyOn(Entitlement, 'updateOne').mockResolvedValue({});
    const ent = appliedDoc();
    jest.spyOn(Entitlement, 'findOneAndUpdate').mockResolvedValue(ent);
    const chain = { select: async () => ({ userId: 'resolved-user' }) };
    const finder = jest.spyOn(Entitlement, 'findOne').mockImplementation((q) => {
      if (q && q.providerCustomerId) return chain;
      return null;
    });
    jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const res = await entitlementService.applyWebhookEvent({
      eventId: 'stripe:evt9',
      type: 'invoice.payment_failed',
      userId: null,
      status: 'past_due',
      provider: 'stripe',
      customerId: 'cus_9',
    });
    expect(res.applied).toBe(true);
    expect(finder).toHaveBeenCalledWith(
      expect.objectContaining({ providerCustomerId: 'cus_9' })
    );
  });

  test('unmapped type is a visible no-op (refund/dispute policy pending)', async () => {
    jest.spyOn(Entitlement, 'updateOne').mockResolvedValue({});
    const ent = appliedDoc();
    jest.spyOn(Entitlement, 'findOneAndUpdate').mockResolvedValue(ent);
    jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const res = await entitlementService.applyWebhookEvent({
      eventId: 'stripe:evtX',
      type: 'charge.dispute.closed',
      userId: '507f1f77bcf86cd799439011',
      status: null,
      provider: 'stripe',
    });
    expect(res.applied).toBe(false);
    expect(res.reason).toMatch(/unmapped/i);
  });

  test('markCancelled mirrors immediate cancel', async () => {
    jest.spyOn(Entitlement, 'findOne').mockResolvedValue(appliedDoc());
    const mirror = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const updated = await entitlementService.markCancelled('507f1f77bcf86cd799439011', { atPeriodEnd: false });
    expect(updated.status).toBe('cancelled');
    expect(mirror).toHaveBeenCalledWith(
      { userId: '507f1f77bcf86cd799439011' },
      expect.objectContaining({ status: 'cancelled' }),
      expect.anything()
    );
  });
});

describe('scheduler atomic claims', () => {
  test('billingScheduler.processCharge stands down on lost race', async () => {
    const billingScheduler = require('../utils/billingScheduler');
    jest.spyOn(BillingSchedule, 'findOneAndUpdate').mockResolvedValue(null);
    const res = await billingScheduler.processCharge('507f1f77bcf86cd799439011');
    expect(res.success).toBe(false);
    expect(BillingSchedule.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      expect.anything(),
      expect.objectContaining({ new: true })
    );
  });

  test('paystack loop skips unclaimed rows', async () => {
    const paystackScheduler = require('../utils/paystackScheduler');
    jest.spyOn(BillingSchedule, 'find').mockResolvedValue([{ _id: 'a' }, { _id: 'b' }]);
    jest.spyOn(BillingSchedule, 'findOneAndUpdate').mockResolvedValue(null);
    const processSpy = jest.spyOn(paystackScheduler, 'processCharge').mockResolvedValue({ success: true });
    const res = await paystackScheduler.processScheduledCharges();
    expect(processSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ processed: 0 });
  });

  test('flutterwave loop skips unclaimed rows', async () => {
    const flutterwaveScheduler = require('../utils/flutterwaveScheduler');
    jest.spyOn(BillingSchedule, 'find').mockResolvedValue([{ _id: 'a' }]);
    jest.spyOn(BillingSchedule, 'findOneAndUpdate').mockResolvedValue(null);
    const res = await flutterwaveScheduler.processScheduledCharges();
    expect(res).toEqual({ processed: 0 });
  });
});

describe('v1 checkout server pricing', () => {
  const buildApp = () => {
    jest.resetModules();
    const app = express();
    app.use(express.json());
    app.use('/api/v1/billing', require('../server/routes/billing'));
    const Subscription = require('../models/Subscription');
    const Entitlement = require('../server/models/EntitlementModel');
    const { PaystackAdapter } = require('../server/services/billing/adapters/paystack');
    return { app, Subscription, Entitlement, PaystackAdapter };
  };

  test('client amount is ignored (server table wins)', async () => {
    const { app, Subscription, Entitlement, PaystackAdapter } = buildApp();
    const spy = jest.spyOn(PaystackAdapter.prototype, 'createCheckout').mockResolvedValue({ url: 'https://pay' });
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({ _id: 's', customerId: null });
    jest.spyOn(Entitlement, 'create').mockResolvedValue({});
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .send({ plan: 'pro', interval: 'monthly', country: 'NG', currency: 'NGN', amount: 1 });
    expect(res.status).toBe(200);
    // Regional row wins over the client amount (1) and the USD table (20):
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ amount: 21500, currency: 'NGN' }));
  });

  test('unknown plan and off-rail yearly are 400', async () => {
    const { app, PaystackAdapter } = buildApp();
    const spy = jest.spyOn(PaystackAdapter.prototype, 'createCheckout').mockResolvedValue({ url: 'x' });
    const badPlan = await request(app)
      .post('/api/v1/billing/checkout')
      .send({ plan: 'nope', interval: 'monthly', country: 'NG' });
    expect(badPlan.status).toBe(400);
    const yearly = await request(app)
      .post('/api/v1/billing/checkout')
      .send({ plan: 'pro', interval: 'yearly', country: 'NG' });
    expect(yearly.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test('webhook replay answers 200 with current state', async () => {
    const { app, Subscription } = buildApp();
    const { StripeAdapter } = require('../server/services/billing/adapters/stripe');
    jest.spyOn(StripeAdapter.prototype, 'verifyWebhook').mockResolvedValue({
      eventId: 'stripe:evt1',
      type: 'checkout.session.completed',
      userId: '507f1f77bcf86cd799439011',
      plan: 'pro',
      status: 'active',
    });
    const Ent = require('../server/models/EntitlementModel');
    jest.spyOn(Ent, 'updateOne').mockResolvedValue({});
    jest.spyOn(Ent, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(Ent, 'findOne').mockResolvedValue({ status: 'active', plan: 'pro' });
    jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
    const res = await request(app).post('/api/v1/billing/webhook/stripe').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
  });
});

describe('ban flag + admin gate (3.10)', () => {
  const buildApp = () => {
    jest.resetModules();
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin'));
    return app;
  };

  test('admin endpoints fail closed without a key', async () => {
    delete process.env.ADMIN_API_KEY;
    const app = buildApp();
    const res = await request(app).post('/api/admin/users/507f1f77bcf86cd799439011/ban').send({});
    expect(res.status).toBe(403);
  });

  test('wrong key is rejected, right key bans', async () => {
    process.env.ADMIN_API_KEY = 'k-admin-secret';
    const app = buildApp();
    const User = require('../models/User');
    const denied = await request(app)
      .post('/api/admin/users/507f1f77bcf86cd799439011/ban')
      .set('x-admin-key', 'wrong')
      .send({});
    expect(denied.status).toBe(403);
    const doc = { _id: 'u', email: 'a@b.c', save: jest.fn(async function () { return this; }) };
    jest.spyOn(User, 'findById').mockResolvedValue(doc);
    const res = await request(app)
      .post('/api/admin/users/507f1f77bcf86cd799439011/ban')
      .set('x-admin-key', 'k-admin-secret')
      .send({ reason: 'spam' });
    expect(res.status).toBe(200);
    expect(doc.isBanned).toBe(true);
    expect(doc.banReason).toBe('spam');
  });

  test('liveness rejects banned accounts like deleted ones', async () => {
    // Bypass this file's authenticateToken mock: exercise the real helper.
    const { userExists } = jest.requireActual('../middleware/auth');
    const User = require('../models/User');
    const spy = jest.spyOn(User, 'exists').mockImplementation(async (query) => {
      expect(query).toEqual(expect.objectContaining({ isBanned: { $ne: true } }));
      return null;
    });
    expect(await userExists('507f1f77bcf86cd799439011')).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});

describe('profile export (3.10)', () => {
  const buildApp = () => {
    jest.resetModules();
    const app = express();
    app.use(express.json());
    app.use('/api/profile', require('../routes/profile'));
    return app;
  };

  test('dump excludes secrets and other users PII', async () => {
    const app = buildApp();
    const USER_ID = '507f1f77bcf86cd799439011';
    const selectCalls = [];
    const projecting = (doc) => ({
      select: (proj) => {
        selectCalls.push(proj);
        return { lean: async () => doc };
      },
    });
    const User = require('../models/User');
    jest.spyOn(User, 'findById').mockReturnValue(
      projecting({ _id: USER_ID, email: 'a@b.c', fullName: 'A' })
    );
    const Subscription = require('../models/Subscription');
    jest.spyOn(Subscription, 'findOne').mockReturnValue(
      projecting({ tier: 'pro' })
    );
    const Company = require('../models/Company');
    jest.spyOn(Company, 'find').mockReturnValue({
      select: () => ({
        lean: async () => [{
          _id: 'c', name: 'Co', owner: 'o',
          members: [{ user: { _id: USER_ID }, role: 'admin' }, { user: { _id: 'stranger' }, role: 'member' }],
        }],
      }),
    });
    const leanList = (docs) => ({ lean: async () => docs });
    for (const [path, method] of [
      ['../models/LocalProject', 'find'], ['../models/TeamProject', 'find'],
      ['../models/LocalTask', 'find'], ['../models/Message', 'find'],
      ['../models/SupportTicket', 'find'],
    ]) {
      jest.spyOn(require(path), method).mockReturnValue(leanList([]));
    }
    const CodeFile = require('../models/CodeFile');
    jest.spyOn(CodeFile, 'find').mockReturnValue({
      select: (proj) => {
        selectCalls.push(proj);
        return { lean: async () => [] };
      },
    });
    const res = await request(app).get('/api/profile/export');
    expect(res.status).toBe(200);
    // Exclusions are enforced via query projections (stubs don't project):
    expect(selectCalls).toContainEqual(expect.stringContaining('-password'));
    expect(selectCalls).toContainEqual(expect.stringContaining('-paymentId'));
    expect(selectCalls).toContainEqual(expect.stringContaining('-versions'));
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('stranger');
    expect(res.body.companies[0].myRole).toBe('admin');
  });
});

describe('redis fallbacks without REDIS_URL', () => {
  test('helpers degrade to single-instance behavior', async () => {
    delete process.env.REDIS_URL;
    const redis = require('../utils/redis');
    expect(redis.isRedisConfigured()).toBe(false);
    expect(await redis.getRedisClients()).toBe(null);
    expect(redis.getRateLimitStore()).toBe(undefined);
    let ran = false;
    const out = await redis.withLeadership('x', 1000, async () => { ran = true; return 'ok'; });
    expect(ran).toBe(true);
    expect(out).toBe('ok');
  });

  test('resilient session store falls back to memory', async () => {
    delete process.env.REDIS_URL;
    const { createSessionStore } = require('../utils/redisSessionStore');
    const store = createSessionStore();
    expect(store.constructor.name).toBe('MemoryStore');
  });
});
