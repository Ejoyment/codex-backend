/**
 * Payment verification hardening.
 *
 * - Flutterwave checkout prices/plans are server-side (client `amount` ignored).
 * - Verification is bound to the authenticated user, the expected amount, and
 *   the expected currency.
 * - Replaying the same provider reference/card token is idempotent and does not
 *   schedule a second charge.
 */
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
process.env.FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'sk-test';

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { userId: '507f1f77bcf86cd799439011' };
    next();
  },
}));

jest.mock('../config/paystack', () => ({
  transaction: { initialize: jest.fn(), verify: jest.fn(), charge: jest.fn() },
  customer: { create: jest.fn() },
}));

jest.mock('../config/flutterwave', () => ({
  Payment: { initialize: jest.fn() },
  Transaction: { verify: jest.fn() },
  Tokenized: { charge: jest.fn() },
}));

jest.mock('../utils/paystackScheduler', () => ({
  scheduleFirstCharge: jest.fn(async () => ({})),
  scheduleSecondCharge: jest.fn(async () => ({})),
  scheduleRecurringCharge: jest.fn(async () => ({})),
  cancelUserCharges: jest.fn(async () => ({})),
}));

jest.mock('../utils/flutterwaveScheduler', () => ({
  scheduleFirstCharge: jest.fn(async () => ({})),
  scheduleSecondCharge: jest.fn(async () => ({})),
  scheduleRecurringCharge: jest.fn(async () => ({})),
  cancelUserCharges: jest.fn(async () => ({})),
}));

const paystack = require('../config/paystack');
const flw = require('../config/flutterwave');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const PaystackScheduler = require('../utils/paystackScheduler');
const FlutterwaveScheduler = require('../utils/flutterwaveScheduler');
const paystackRouter = require('../routes/paystack-billing');
const flutterwaveRouter = require('../routes/flutterwave-billing');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/paystack-billing', paystackRouter);
  app.use('/api/flutterwave-billing', flutterwaveRouter);
  return app;
}

const PAYSTACK_OK = {
  status: true,
  data: {
    status: 'success',
    amount: 50,
    currency: 'USD',
    metadata: { userId: '507f1f77bcf86cd799439011', isVerification: true },
    authorization: { authorization_code: 'auth-1' },
  },
};

const FLW_OK = {
  status: 'success',
  data: {
      status: 'successful',
      amount: 20,
      currency: 'USD',
      tx_ref: 'txref_123_507f1f77bcf86cd799439011',
      meta: { userId: '507f1f77bcf86cd799439011', plan: 'pro' },
      card: { token: 'card-1' },
      customer: { id: 'cus-1' },
  },
};

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Flutterwave checkout pricing', () => {
  test('ignores the client amount and uses the plan table', async () => {
    const app = makeApp();
    flw.Payment.initialize.mockResolvedValue({ status: 'success', data: { link: 'https://pay' } });
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: '507f1f77bcf86cd799439011', email: 'a@b.c', fullName: 'A' });

    const res = await request(app)
      .post('/api/flutterwave-billing/initialize')
      .send({ amount: 1, plan: 'team_premium' });

    expect(res.status).toBe(200);
    expect(flw.Payment.initialize).toHaveBeenCalledWith(expect.objectContaining({
      amount: 120,
      currency: 'USD',
      meta: expect.objectContaining({ plan: 'team_premium' }),
    }));
  });

  test('rejects unknown plans without calling the provider', async () => {
    const app = makeApp();
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: '507f1f77bcf86cd799439011', email: 'a@b.c' });
    const res = await request(app)
      .post('/api/flutterwave-billing/initialize')
      .send({ plan: 'enterprise' });

    expect(res.status).toBe(400);
    expect(flw.Payment.initialize).not.toHaveBeenCalled();
  });
});

describe('Flutterwave verification binding', () => {
  test('rejects a transaction owned by another account', async () => {
    const app = makeApp();
    flw.Transaction.verify.mockResolvedValue({
      status: 'success',
      data: {
        ...FLW_OK.data,
        meta: { userId: 'user-2', plan: 'pro' },
        tx_ref: 'txref_123_user-2',
      },
    });

    const res = await request(app)
      .post('/api/flutterwave-billing/verify')
      .send({ transaction_id: 'tx-1' });

    expect(res.status).toBe(403);
    expect(FlutterwaveScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });

  test('rejects a paid amount that does not match the plan', async () => {
    const app = makeApp();
    flw.Transaction.verify.mockResolvedValue({
      status: 'success',
      data: { ...FLW_OK.data, amount: 1 },
    });

    const res = await request(app)
      .post('/api/flutterwave-billing/verify')
      .send({ transaction_id: 'tx-1' });

    expect(res.status).toBe(400);
    expect(FlutterwaveScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });

  test('is idempotent for the same card token', async () => {
    const app = makeApp();
    flw.Transaction.verify.mockResolvedValue(FLW_OK);
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: '507f1f77bcf86cd799439011', email: 'a@b.c' });
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({
      paymentId: 'card-1',
      status: 'trial',
      tier: 'pro',
      trialEndsAt: new Date(),
    });

    const res = await request(app)
      .post('/api/flutterwave-billing/verify')
      .send({ transaction_id: 'tx-1' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(FlutterwaveScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });
});

describe('Paystack verification binding', () => {
  test('rejects a reference from another account', async () => {
    const app = makeApp();
    paystack.transaction.verify.mockResolvedValue({
      status: true,
      data: { ...PAYSTACK_OK.data, metadata: { userId: 'user-2' } },
    });

    const res = await request(app)
      .post('/api/paystack-billing/verify')
      .send({ reference: 'ref-1' });

    expect(res.status).toBe(403);
    expect(PaystackScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });

  test('rejects a non-verification amount', async () => {
    const app = makeApp();
    paystack.transaction.verify.mockResolvedValue({
      status: true,
      data: { ...PAYSTACK_OK.data, amount: 1 },
    });

    const res = await request(app)
      .post('/api/paystack-billing/verify')
      .send({ reference: 'ref-1' });

    expect(res.status).toBe(400);
    expect(PaystackScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });

  test('activates a trial and schedules one first charge', async () => {
    const app = makeApp();
    paystack.transaction.verify.mockResolvedValue(PAYSTACK_OK);
    jest.spyOn(User, 'findById').mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: 'a@b.c',
      fullName: 'A',
      paystackCustomerId: 'cus-1',
    });
    const save = jest.spyOn(Subscription.prototype, 'save').mockResolvedValue({});
    jest.spyOn(Subscription, 'findOne').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/paystack-billing/verify')
      .send({ reference: 'ref-1' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(PaystackScheduler.scheduleFirstCharge).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.anything(),
      expect.any(Date),
      'pro'
    );
  });

  test('is idempotent for the same authorization code', async () => {
    const app = makeApp();
    paystack.transaction.verify.mockResolvedValue(PAYSTACK_OK);
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: '507f1f77bcf86cd799439011', email: 'a@b.c', fullName: 'A' });
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({
      paymentId: 'auth-1',
      status: 'trial',
      tier: 'pro',
      trialEndsAt: new Date(),
    });

    const res = await request(app)
      .post('/api/paystack-billing/verify')
      .send({ reference: 'ref-1' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(PaystackScheduler.scheduleFirstCharge).not.toHaveBeenCalled();
  });
});
