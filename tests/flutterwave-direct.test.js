/**
 * Rec 15 — Flutterwave direct REST (config/flutterwave.js), no SDK.
 *
 * - Without FLUTTERWAVE_SECRET_KEY the client throws 'not configured'.
 * - With a key, Payment.initialize / Transaction.verify / Tokenized.charge
 *   hit the right REST endpoints (axios mocked) and surface API errors.
 * - Routes: 503 when unconfigured; initialize/verify/cancel happy paths.
 * - Scheduler processCharge completes a charge end-to-end (models stubbed).
 * - Webhook verification accepts verif-hash (current) + flw-signature (legacy).
 *
 * No database, no network: axios + models stubbed throughout. config/ and
 * the router read env / capture modules at load, so each test rebuilds them
 * through loadStack() AFTER env surgery (jest module registries are
 * per-isolation: spies must target the freshly required copies).
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
mongoose.set('bufferCommands', false);

jest.mock('axios');
jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { userId: '507f1f77bcf86cd799439011' };
    next();
  },
}));
jest.doMock('../utils/flutterwaveScheduler', () => ({
  scheduleFirstCharge: jest.fn(async () => ({})),
  scheduleSecondCharge: jest.fn(async () => ({})),
  scheduleRecurringCharge: jest.fn(async () => ({})),
  processCharge: jest.fn(),
  processScheduledCharges: jest.fn(),
  cancelUserCharges: jest.fn(async () => ({ modifiedCount: 1 })),
}));

const { verifyFlutterwave } = require('../utils/webhookSecurity');

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

// Fresh registry AFTER env surgery: returns the axios mock controls plus the
// freshly loaded modules (spies must target these copies, not file-level ones).
function loadStack() {
  jest.resetModules();
  const axios = require('axios');
  const post = jest.fn();
  const get = jest.fn();
  axios.create.mockReturnValue({ post, get });
  const flw = require('../config/flutterwave');
  const router = require('../routes/flutterwave-billing');
  const User = require('../models/User');
  const Subscription = require('../models/Subscription');
  const BillingSchedule = require('../models/BillingSchedule');
  const scheduler = require('../utils/flutterwaveScheduler');
  const app = express();
  app.use(express.json());
  app.use('/api/flutterwave-billing', router);
  return { flw, app, post, get, axiosMock: axios, User, Subscription, BillingSchedule, scheduler };
}

describe('config client shape', () => {
  test('unconfigured client throws not-configured on every method', async () => {
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    const { flw } = loadStack();
    await expect(flw.Payment.initialize({})).rejects.toThrow(/not configured/i);
    await expect(flw.Transaction.verify({ id: '1' })).rejects.toThrow(/not configured/i);
    await expect(flw.Tokenized.charge({})).rejects.toThrow(/not configured/i);
  });

  test('Payment.initialize POSTs /v3/payments and returns the body', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { flw, post } = loadStack();
    post.mockResolvedValue({ data: { status: 'success', data: { link: 'https://pay.link' } } });
    const payload = { tx_ref: 'x', amount: 50, currency: 'USD' };
    const res = await flw.Payment.initialize(payload);
    expect(post).toHaveBeenCalledWith('/payments', payload);
    expect(res.data.link).toBe('https://pay.link');
  });

  test('Transaction.verify GETs /v3/transactions/{id}/verify', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { flw, get } = loadStack();
    get.mockResolvedValue({ data: { status: 'success', data: { status: 'successful' } } });
    await flw.Transaction.verify({ id: 'tx-9' });
    expect(get).toHaveBeenCalledWith('/transactions/tx-9/verify');
  });

  test('Tokenized.charge POSTs /v3/tokenized-charges', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { flw, post } = loadStack();
    post.mockResolvedValue({ data: { status: 'success', data: { id: 42 } } });
    const payload = { token: 't', amount: 50 };
    const res = await flw.Tokenized.charge(payload);
    expect(post).toHaveBeenCalledWith('/tokenized-charges', payload);
    expect(res.data.id).toBe(42);
  });

  test('API errors are logged and rethrown', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { flw, get } = loadStack();
    const err = new Error('bad');
    err.response = { data: { message: 'nope' } };
    get.mockRejectedValue(err);
    await expect(flw.Transaction.verify({ id: 'tx-9' })).rejects.toBe(err);
  });

  test('axios client carries the secret as Bearer auth', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { axiosMock } = loadStack();
    expect(axiosMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.flutterwave.com/v3',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      })
    );
  });
});

describe('routes', () => {
  test('initialize → 503 when unconfigured (before any DB touch)', async () => {
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    const { app } = loadStack();
    const res = await request(app).post('/api/flutterwave-billing/initialize').send({});
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  test('initialize happy path returns payment link', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { app, post, User } = loadStack();
    post.mockResolvedValue({ data: { status: 'success', data: { link: 'https://pay.link' } } });
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u', email: 'a@b.c', fullName: 'A' });
    const res = await request(app).post('/api/flutterwave-billing/initialize').send({});
    expect(res.status).toBe(200);
    expect(res.body.paymentLink).toBe('https://pay.link');
    expect(res.body.reference).toMatch(/^txref_/);
  });

  test('verify happy path activates the trial and schedules the charge', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { app, get, User, Subscription, scheduler } = loadStack();
    get.mockResolvedValue({
      data: {
        status: 'success',
        data: { status: 'successful', amount: 50, card: { token: 'ct' }, customer: { id: 'cu' } },
      },
    });
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u', email: 'a@b.c', fullName: 'A' });
    const subDoc = {
      save: jest.fn(async function () { return this; }),
      upgradeTo: jest.fn(),
    };
    jest.spyOn(Subscription, 'findOne').mockResolvedValue(subDoc);
    const res = await request(app).post('/api/flutterwave-billing/verify').send({ transaction_id: 'tx-1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(scheduler.scheduleFirstCharge).toHaveBeenCalled();
  });

  test('verify rejects a failed payment', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { app, get } = loadStack();
    get.mockResolvedValue({ data: { status: 'success', data: { status: 'failed', amount: 0 } } });
    const res = await request(app).post('/api/flutterwave-billing/verify').send({ transaction_id: 'tx-1' });
    expect(res.status).toBe(400);
  });

  test('cancel marks the subscription cancelled', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { app, Subscription } = loadStack();
    const subDoc = { status: 'active', save: jest.fn(async function () { return this; }) };
    jest.spyOn(Subscription, 'findOne').mockResolvedValue(subDoc);
    const res = await request(app).post('/api/flutterwave-billing/cancel').send({});
    expect(res.status).toBe(200);
    expect(subDoc.status).toBe('cancelled');
  });

  test('status returns the subscription snapshot', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    const { app, Subscription, BillingSchedule } = loadStack();
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({
      tier: 'pro',
      status: 'trial',
      pricing: { amount: 50, currency: 'USD' },
    });
    const q = {
      sort: () => q,
      limit: () => q,
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    jest.spyOn(BillingSchedule, 'find').mockImplementation(() => q);
    const res = await request(app).get('/api/flutterwave-billing/status');
    expect(res.status).toBe(200);
    expect(res.body.subscription.tier).toBe('pro');
  });
});

describe('scheduler processCharge', () => {
  test('successful tokenized charge completes the schedule', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'sk-test';
    jest.resetModules();
    const axios = require('axios');
    const post = jest.fn();
    axios.create.mockReturnValue({ post, get: jest.fn() });
    // Bypass this file's doMock: here we want the REAL scheduler.
    const scheduler = jest.requireActual('../utils/flutterwaveScheduler');
    post.mockResolvedValue({ data: { status: 'success', data: { id: 77 } } });

    const Subscription = require('../models/Subscription');
    jest.spyOn(Subscription, 'findById').mockResolvedValue({
      customerId: 'cu',
      paymentId: 'ct',
      email: 'a@b.c',
      save: jest.fn(async function () { return this; }),
    });
    const BillingSchedule = require('../models/BillingSchedule');
    jest.spyOn(BillingSchedule.prototype, 'save').mockResolvedValue({});

    const schedule = {
      _id: new mongoose.Types.ObjectId(),
      userId: 'u',
      subscriptionId: new mongoose.Types.ObjectId(),
      chargeType: 'recurring',
      amount: 5000,
      status: 'pending',
      save: jest.fn(async function () { return this; }),
    };
    const res = await scheduler.processCharge(schedule);
    expect(post).toHaveBeenCalledWith('/tokenized-charges', expect.objectContaining({ token: 'ct' }));
    expect(res.success).toBe(true);
    expect(schedule.status).toBe('completed');
  });
});

describe('webhook verification headers', () => {
  test('accepts the current verif-hash header', () => {
    const res = verifyFlutterwave(
      { body: {}, headers: { 'verif-hash': 'correct-hash' } },
      { secret: 'correct-hash' }
    );
    expect(res.verified).toBe(true);
  });

  test('still accepts the legacy flw-signature header', () => {
    const res = verifyFlutterwave(
      { body: {}, headers: { 'flw-signature': 'correct-hash' } },
      { secret: 'correct-hash' }
    );
    expect(res.verified).toBe(true);
  });
});

describe('legacy utils adapter (global rail)', () => {
  test('unconfigured key fails closed without network', async () => {
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    const fwAdapter = require('../utils/flutterwaveAdapter');
    const res = await fwAdapter.createCheckout({ userId: 'u', amount: 20, currency: 'USD' });
    expect(res.success).toBe(false);
    expect(res.code).toBe('PROVIDER_UNAVAILABLE');
  });
});
