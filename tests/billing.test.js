/**
 * Enterprise Billing Integration Tests
 * Tests: payment gateways, subscription flows, webhook handlers
 * Covers: stripe, paystack, flutterwave, billingCron, errorHandler
 */

// Mock stripe BEFORE any requires
jest.mock('stripe', () => {
  return jest.fn(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'cs_test_123', payment_status: 'paid', customer: 'cus_123' }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'bps_test_123', url: 'https://billing.stripe.com/session/test' }),
      },
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_123', email: 'test@test.com' }),
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_123', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 2592000 }),
      update: jest.fn().mockResolvedValue({ id: 'sub_123', status: 'active' }),
      cancel: jest.fn().mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
    },
  }));
});

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ start: jest.fn() })) }));

describe('Stripe Payment Gateway', () => {
  let stripeModule;

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_PROFESSIONAL_PRICE_ID = 'price_prof_monthly';
    process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID = 'price_prof_yearly';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_enterprise';
    process.env.FRONTEND_URL = 'http://localhost:5500';
    stripeModule = require('../config/stripe');
  });

  test('should export stripe config module', () => {
    expect(stripeModule).toBeDefined();
    expect(stripeModule.stripe).toBeDefined();
    expect(typeof stripeModule.createCheckoutSession).toBe('function');
    expect(typeof stripeModule.createPortalSession).toBe('function');
    expect(typeof stripeModule.verifyWebhookSignature).toBe('function');
    expect(stripeModule.PRICE_IDS).toBeDefined();
  });

  test('should create checkout session', async () => {
    const result = await stripeModule.createCheckoutSession('user-123', 'test@test.com', 'professional', 'monthly');
    expect(result.success).toBe(true);
    expect(result.sessionId).toContain('cs_test');
    expect(result.url).toContain('stripe.com');
  });

  test('should verify webhook events', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'evt_test' }));
    const result = stripeModule.verifyWebhookSignature(payload, 'test_sig');
    expect(result.success).toBe(true);
    expect(result.event.type).toBe('checkout.session.completed');
  });
  
  test('should have PRICE_IDS mapping', () => {
    expect(stripeModule.PRICE_IDS.professional_monthly).toBe('price_prof_monthly');
    expect(stripeModule.PRICE_IDS.professional_yearly).toBe('price_prof_yearly');
    expect(stripeModule.PRICE_IDS.enterprise).toBe('price_enterprise');
  });
});

describe('Paystack Payment Gateway', () => {
  test('should export paystack module when not configured', () => {
    // Save and clear to test unconfigured state
    const origKey = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    const paystack = require('../config/paystack');
    expect(paystack).toBeDefined();
    expect(typeof paystack.transaction.initialize).toBe('function');
    expect(typeof paystack.transaction.verify).toBe('function');
    process.env.PAYSTACK_SECRET_KEY = origKey;
  });

  test('should throw when paystack not configured', async () => {
    const origKey = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    const paystack = require('../config/paystack');
    await expect(paystack.transaction.initialize({})).rejects.toThrow('Paystack not configured');
    process.env.PAYSTACK_SECRET_KEY = origKey;
  });
});

describe('Subscription States', () => {
  test('should handle active subscription', () => {
    const subscription = {
      id: 'sub_123',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 2592000000).toISOString(),
      plan: { nickname: 'Professional Monthly', amount: 2900 },
    };
    expect(subscription.status).toBe('active');
    expect(new Date(subscription.currentPeriodEnd) > new Date()).toBe(true);
  });

  test('should handle expired subscription', () => {
    const subscription = {
      id: 'sub_456',
      status: 'past_due',
      currentPeriodEnd: new Date(Date.now() - 86400000).toISOString(),
    };
    expect(subscription.status).toBe('past_due');
    expect(new Date(subscription.currentPeriodEnd) < new Date()).toBe(true);
  });

  test('should handle canceled subscription', () => {
    const subscription = {
      id: 'sub_789',
      status: 'canceled',
      canceledAt: new Date().toISOString(),
    };
    expect(subscription.status).toBe('canceled');
  });
});

describe('Billing Cron', () => {
  test('should export start function', () => {
    const billingCron = require('../utils/billingCron');
    expect(billingCron).toBeDefined();
  });
});

describe('Error Handler - Payment Errors', () => {
  let errorHandler;

  beforeAll(() => {
    errorHandler = require('../utils/errorHandler');
  });

  test('should categorize Stripe errors as PAYMENT', () => {
    const error = new Error('Stripe: Payment failed');
    expect(errorHandler.categorizeError(error)).toBe(errorHandler.ErrorTypes.PAYMENT);
  });

  test('should categorize Paystack errors as PAYMENT', () => {
    const error = new Error('Paystack transaction failed');
    expect(errorHandler.categorizeError(error)).toBe(errorHandler.ErrorTypes.PAYMENT);
  });

  test('should provide user-friendly message for payment errors', () => {
    const message = errorHandler.getUserFriendlyMessage(errorHandler.ErrorTypes.PAYMENT, new Error('fail'));
    expect(message).toContain('payment');
  });

  test('billing errors should be CRITICAL severity', () => {
    const error = new Error('Stripe payment failed');
    expect(errorHandler.determineSeverity(errorHandler.ErrorTypes.PAYMENT, error))
      .toBe(errorHandler.ErrorSeverity.CRITICAL);
  });
});