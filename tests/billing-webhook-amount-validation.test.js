const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
process.env.PAYSTACK_SECRET_KEY = 'paystack-webhook-secret';
process.env.FLUTTERWAVE_SECRET_KEY = 'flutterwave-secret';
process.env.FLUTTERWAVE_WEBHOOK_HASH = 'flutterwave-webhook-hash';

const Entitlement = require('../server/models/EntitlementModel');
const Subscription = require('../models/Subscription');
const { PaystackAdapter } = require('../server/services/billing/adapters/paystack');
const { FlutterwaveAdapter } = require('../server/services/billing/adapters/flutterwave');

const USER = '507f1f77bcf86cd799439011';

function makeApp() {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/api/v1/billing', require('../server/routes/billing'));
  return app;
}

function paystackSignature(body) {
  return crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
}

function postPaystack(body) {
  return request(makeApp())
    .post('/api/v1/billing/webhook/paystack')
    .set('content-type', 'application/json')
    .set('x-paystack-signature', paystackSignature(body))
    .send(body);
}

function postFlutterwave(body) {
  return request(makeApp())
    .post('/api/v1/billing/webhook/flutterwave')
    .set('content-type', 'application/json')
    .set('verif-hash', process.env.FLUTTERWAVE_WEBHOOK_HASH)
    .send(body);
}

function paystackBody({ id = 1, amount, currency = 'NGN', metadata = {} } = {}) {
  return JSON.stringify({
    event: 'charge.success',
    id,
    data: {
      reference: `ref-${id}`,
      amount,
      currency,
      metadata: { userId: USER, ...metadata },
      customer: { customer_code: 'CUS_1' },
    },
  });
}

function mockPrior(prior) {
  return jest.spyOn(Entitlement, 'findOne').mockImplementation(() => ({
    select: jest.fn().mockResolvedValue(prior),
  }));
}

function mockApplied(plan = 'pro', status = 'active') {
  const entitlement = {
    userId: USER,
    plan,
    status,
    currency: 'USD',
    appliedEventIds: [],
    save: jest.fn(async function save() { return this; }),
  };
  const updateOne = jest.spyOn(Entitlement, 'updateOne').mockResolvedValue({});
  const findOneAndUpdate = jest.spyOn(Entitlement, 'findOneAndUpdate').mockResolvedValue(entitlement);
  const mirror = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({});
  return { entitlement, updateOne, findOneAndUpdate, mirror };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('canonical webhook amount/currency validation', () => {
  test('rejects a Paystack charge below the canonical plan price without granting entitlement', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate, mirror } = mockApplied();

    const res = await postPaystack(paystackBody({ amount: 100, metadata: { plan: 'pro' } }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/amount/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(mirror).not.toHaveBeenCalled();
  });

  test('rejects a charge whose currency does not match canonical plan pricing', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 2000,
      currency: 'EUR',
      metadata: { plan: 'pro' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/currency/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('accepts the exact canonical regional price and activates the plan', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate, mirror } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 2150000,
      currency: 'NGN',
      metadata: { plan: 'pro', interval: 'monthly' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.plan).toBe('pro');
    expect(updateOne).toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
      expect.objectContaining({ $set: expect.objectContaining({ plan: 'pro', currency: 'NGN' }) }),
      expect.anything()
    );
    expect(mirror).toHaveBeenCalledWith(
      { userId: USER },
      expect.objectContaining({ tier: 'pro', status: 'active' }),
      expect.anything()
    );
  });

  test('accepts the standard USD amount for team tiers without a regional row', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied('team_standard');

    const res = await postPaystack(paystackBody({
      amount: 4000,
      currency: 'USD',
      metadata: { plan: 'team_standard', interval: 'monthly' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.plan).toBe('team_standard');
    expect(updateOne).toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalled();
  });

  test('rejects a team-tier charge that does not match the standard USD amount', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied('team_standard');

    const res = await postPaystack(paystackBody({
      amount: 100,
      currency: 'USD',
      metadata: { plan: 'team_standard', interval: 'monthly' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/amount/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('binds activation to the plan already stored on the entitlement when metadata omits it', async () => {
    const prior = {
      userId: USER,
      plan: 'pro',
      status: 'active',
      currency: 'USD',
      appliedEventIds: [],
    };
    mockPrior(prior);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 2000,
      currency: 'USD',
      metadata: {},
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.plan).toBe('pro');
    expect(updateOne).toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
      expect.objectContaining({ $set: expect.objectContaining({ plan: 'pro' }) }),
      expect.anything()
    );
  });

  test('rejects activation when neither the event nor the stored entitlement has a paid plan', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 2000,
      currency: 'USD',
      metadata: {},
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/plan/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('accepts the canonical yearly amount when checkout metadata carries the yearly interval', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 21500000,
      currency: 'NGN',
      metadata: { plan: 'pro', interval: 'yearly' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(updateOne).toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalled();
  });

  test('rejects a yearly amount when checkout metadata says monthly', async () => {
    mockPrior(null);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 21500000,
      currency: 'NGN',
      metadata: { plan: 'pro', interval: 'monthly' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/amount/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('keeps replay idempotent even for an already-applied event', async () => {
    const prior = {
      userId: USER,
      plan: 'pro',
      status: 'active',
      currency: 'NGN',
      appliedEventIds: ['paystack:1'],
    };
    mockPrior(prior);
    const { updateOne, findOneAndUpdate } = mockApplied();

    const res = await postPaystack(paystackBody({
      amount: 100,
      metadata: { plan: 'pro' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
    expect(res.body.data.reason).toMatch(/duplicate/i);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('provider amount normalization', () => {
  test('Paystack kobo and Flutterwave major units both normalize to minor units', async () => {
    const paystackEvent = await new PaystackAdapter().verifyWebhook({
      rawBody: Buffer.from(paystackBody({ amount: 2150000, metadata: { plan: 'pro' } })),
      signature: paystackSignature(paystackBody({ amount: 2150000, metadata: { plan: 'pro' } })),
    });
    expect(paystackEvent.amountMinor).toBe(2150000);
    expect(paystackEvent.currency).toBe('NGN');

    const flutterwaveBody = JSON.stringify({
      id: 'evt-flw-1',
      event: 'charge.completed',
      data: {
        status: 'successful',
        tx_ref: 'tx-flw-1',
        amount: 190,
        currency: 'GHS',
        meta: { userId: USER, plan: 'pro' },
        customer: { email: 'a@b.c' },
      },
    });
    const flutterwaveEvent = await new FlutterwaveAdapter().verifyWebhook({
      rawBody: Buffer.from(flutterwaveBody),
      signature: process.env.FLUTTERWAVE_WEBHOOK_HASH,
    });
    expect(flutterwaveEvent.amountMinor).toBe(19000);
    expect(flutterwaveEvent.currency).toBe('GHS');
  });

  test('Flutterwave canonical GHS charge activates at the exact price', async () => {
    mockPrior(null);
    const { updateOne } = mockApplied();
    const body = JSON.stringify({
      id: 'evt-flw-2',
      event: 'charge.completed',
      data: {
        status: 'successful',
        tx_ref: 'tx-flw-2',
        amount: 190,
        currency: 'GHS',
        meta: { userId: USER, plan: 'pro', interval: 'monthly' },
        customer: { email: 'a@b.c' },
      },
    });

    const res = await postFlutterwave(body);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.plan).toBe('pro');
    expect(updateOne).toHaveBeenCalled();
  });
});
