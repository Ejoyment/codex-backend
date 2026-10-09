/**
 * System-design review fixes: data-layer integrity.
 *
 * - AgentExecution.logs/specRef exist in the schema (writers used them for
 *   months while strict mode silently dropped them on save).
 * - LocalTask.agentExecution.status accepts 'rejected' (the socket writes it).
 * - Subscription has the hot-cron indexes; AgentExecution has metadata.taskId.
 * - tierConfigs sources numerics from TIER_LIMITS (no Infinity into Numbers).
 * - Channel/Invitation have partial-unique race guards.
 * - AuthLockout.recordFailure is atomic (upsert + retry, then arm).
 * - SupportTicket REST status validates like the socket path.
 * - Webhook raw-body markers cover the legacy Stripe route.
 * - paymentRouter normalizes every rail to a single `url` key.
 *
 * No database: models stubbed, axios-free paths only.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { userId: '507f1f77bcf86cd799439011' };
    next();
  },
}));

const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const Subscription = require('../models/Subscription');
const Channel = require('../models/Channel');
const Invitation = require('../models/Invitation');
const SupportTicket = require('../models/SupportTicket');
const SupportAgent = require('../models/SupportAgent');
const AuthLockout = require('../models/AuthLockout');
const { TIER_LIMITS } = require('../utils/tierLimits');
const { isWebhookPath } = require('../utils/webhookSecurity');

const supportRouter = require('../routes/support');

const app = express();
app.use(express.json());
app.use('/api/support', supportRouter);

afterEach(() => {
  jest.restoreAllMocks();
});

const schemaIndexes = (model) => model.schema.indexes();

describe('schema fields writers depend on', () => {
  test('AgentExecution has logs[] and specRef (were strict-dropped)', () => {
    expect(AgentExecution.schema.path('logs')).toBeDefined();
    expect(AgentExecution.schema.path('specRef')).toBeDefined();
    const doc = new AgentExecution({
      userId: new mongoose.Types.ObjectId(),
      taskTitle: 't',
      logs: [{ message: 'hi' }],
    });
    expect(doc.logs).toHaveLength(1);
  });

  test('LocalTask.agentExecution.status accepts rejected', () => {
    const values = LocalTask.schema.path('agentExecution.status').enumValues;
    expect(values).toContain('rejected');
  });

  test('Entitlement keeps provider ids + cancelAtPeriodEnd (were strict-dropped)', () => {
    const Entitlement = require('../server/models/EntitlementModel');
    for (const p of ['providerCustomerId', 'providerSubscriptionId', 'cancelAtPeriodEnd']) {
      expect(Entitlement.schema.path(p)).toBeDefined();
    }
  });
});

describe('hot-path indexes', () => {
  test('Subscription has cron indexes', () => {
    const indexes = schemaIndexes(Subscription).map(([f]) => JSON.stringify(f));
    expect(indexes).toContain(JSON.stringify({ status: 1, trialEndsAt: 1 }));
    expect(indexes).toContain(JSON.stringify({ status: 1, 'creditPool.resetAt': 1 }));
  });

  test('AgentExecution has metadata.taskId index', () => {
    const indexes = schemaIndexes(AgentExecution).map(([f]) => JSON.stringify(f));
    expect(indexes).toContain(JSON.stringify({ 'metadata.taskId': 1 }));
  });

  test('Channel has a partial-unique on live names', () => {
    const match = schemaIndexes(Channel).find(([f, o]) => f.company === 1 && f.name === 1 && o && o.unique);
    expect(match).toBeDefined();
    expect(match[1].partialFilterExpression).toEqual({ archived: { $eq: false } });
  });

  test('Invitation has a partial-unique on pending invites', () => {
    const match = schemaIndexes(Invitation).find(([f, o]) => f.email === 1 && f.company === 1 && o && o.unique);
    expect(match).toBeDefined();
    expect(match[1].partialFilterExpression).toEqual({ status: { $eq: 'pending' } });
  });
});

describe('tierConfigs delegates numerics to TIER_LIMITS', () => {
  test('no Infinity survives into Number fields (would throw on sync)', () => {
    const { tierConfigs } = require('../models/Subscription');
    const numerics = ['monthlyCreditLimit', 'cloudComputeHours', 'maxConcurrentJobs', 'taskTimeout',
      'maxDebugHostRooms', 'maxDebugParticipants', 'maxDeployments', 'dataRetentionDays'];
    for (const [tier, cfg] of Object.entries(tierConfigs)) {
      for (const key of numerics) {
        const v = cfg[key];
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });

  test('values match the canonical table', () => {
    const { tierConfigs } = require('../models/Subscription');
    expect(tierConfigs.pro.monthlyCreditLimit).toBe(TIER_LIMITS.pro.monthlyCredits);
    expect(tierConfigs.team_standard.maxDeployments).toBe(TIER_LIMITS.team_standard.maxActiveDeployments);
    expect(tierConfigs.enterprise.maxDebugHostRooms).toBe(null);
  });
});

describe('AuthLockout.recordFailure is atomic', () => {
  test('increments via a single upsert (no read-modify-write)', async () => {
    const doc = { failures: 1, lockedUntil: null, save: jest.fn(async function () { return this; }) };
    const spy = jest.spyOn(AuthLockout, 'findOneAndUpdate').mockResolvedValue(doc);
    const res = await AuthLockout.recordFailure('User@X.io');
    expect(spy).toHaveBeenCalledWith(
      { key: 'user@x.io' },
      expect.objectContaining({ $inc: { failures: 1 } }),
      expect.objectContaining({ upsert: true, new: true })
    );
    expect(res).toEqual({ locked: false });
  });

  test('duplicate-key on concurrent upsert retries instead of crashing', async () => {
    const doc = { failures: 2, lockedUntil: null, save: jest.fn(async function () { return this; }) };
    const dup = new Error('E11000');
    dup.code = 11000;
    const spy = jest.spyOn(AuthLockout, 'findOneAndUpdate')
      .mockRejectedValueOnce(dup)
      .mockResolvedValue(doc);
    const res = await AuthLockout.recordFailure('user@x.io');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ locked: false });
  });

  test('arms the lockout at MAX_FAILURES', async () => {
    const { MAX_FAILURES } = require('../models/AuthLockout');
    const doc = { failures: MAX_FAILURES, lockedUntil: null, save: jest.fn(async function () { return this; }) };
    jest.spyOn(AuthLockout, 'findOneAndUpdate').mockResolvedValue(doc);
    const res = await AuthLockout.recordFailure('user@x.io');
    expect(doc.lockedUntil).toBeInstanceOf(Date);
    expect(res.locked).toBe(true);
  });
});

describe('support REST status allowlist (socket parity)', () => {
  test('PUT rejects off-enum status with 400, not 500', async () => {
    const agentToken = jwt.sign({ agentId: '507f1f77bcf86cd799439077' }, process.env.JWT_SECRET);
    jest.spyOn(SupportAgent, 'findById').mockResolvedValue({ _id: 'ag', name: 'A', role: 'admin' });
    const res = await request(app)
      .put('/api/support/agent/tickets/TKT-1/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid status/i);
  });
});

describe('webhook + checkout contracts', () => {
  test('legacy Stripe webhook path preserves raw bytes', () => {
    expect(isWebhookPath('/api/subscription/webhook/stripe')).toBe(true);
  });

  test('paymentRouter normalizes every rail to url', async () => {
    jest.resetModules();
    jest.doMock('../utils/paystackAdapter', () => ({
      createCheckout: jest.fn(async () => ({ provider: 'paystack', authorizationUrl: 'https://pay' })),
    }));
    jest.doMock('../utils/stripeAdapter', () => ({
      createCheckout: jest.fn(async () => ({ provider: 'stripe', url: 'https://stripe' })),
    }));
    const Subscription = require('../models/Subscription');
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({ _id: 's', customerId: null });
    const Entitlement = require('../server/models/EntitlementModel');
    jest.spyOn(Entitlement, 'create').mockResolvedValue({});
    const paymentRouter = require('../utils/paymentRouter');
    const stripeRes = await paymentRouter.createCheckout('u', 'pro', 'monthly', 'US', 'USD');
    expect(stripeRes.url).toBe('https://stripe');
    const paystackRes = await paymentRouter.createCheckout('u', 'pro', 'monthly', 'NG', 'NGN');
    expect(paystackRes.authorizationUrl).toBe('https://pay');
    expect(paystackRes.url).toBe('https://pay');
  });
});
