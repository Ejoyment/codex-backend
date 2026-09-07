/**
 * Tests for all Config modules
 * Covers: paystack.js, flutterwave.js, swagger.js, passport.js, stripe.js
 */

// Mock swagger-jsdoc before requiring swagger config
jest.mock('swagger-jsdoc', () => {
  return jest.fn(() => ({
    openapi: '3.0.0',
    info: { title: 'CODEX INC API' },
    paths: {},
  }));
});

// Mock stripe before requiring stripe config
jest.mock('stripe', () => {
  return jest.fn(() => ({
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
    },
  }));
});

describe('Config - Paystack', () => {
  test('should export an object with transaction and customer methods', () => {
    const paystack = require('../config/paystack');
    expect(paystack).toBeDefined();
    expect(paystack.transaction).toBeDefined();
    expect(typeof paystack.transaction.initialize).toBe('function');
    expect(typeof paystack.transaction.verify).toBe('function');
    expect(typeof paystack.transaction.charge).toBe('function');
    expect(paystack.customer).toBeDefined();
    expect(typeof paystack.customer.create).toBe('function');
  });
});

describe('Config - Flutterwave', () => {
  test('should export flutterwave configuration', () => {
    const flutterwave = require('../config/flutterwave');
    expect(flutterwave).toBeDefined();
  });
});

describe('Config - Swagger', () => {
  test('should export a swagger spec object', () => {
    const swagger = require('../config/swagger');
    expect(swagger).toBeDefined();
    expect(typeof swagger).toBe('object');
    expect(swagger.openapi).toBe('3.0.0');
  });
});

describe('Config - Passport', () => {
  test('should export a function that initializes passport', () => {
    const passportConfig = require('../config/passport');
    expect(passportConfig).toBeDefined();
    expect(typeof passportConfig).toBe('function');
  });
});

describe('Config - Stripe', () => {
  test('should export stripe configuration', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
    const stripe = require('../config/stripe');
    expect(stripe).toBeDefined();
  });
});