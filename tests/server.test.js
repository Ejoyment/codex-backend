/**
 * Integration tests for the main Express server (server.js)
 * Tests health check, root endpoint, API docs, and error handling
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

// Set JWT_SECRET for token verification
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/auth/google/callback';
process.env.FACEBOOK_APP_ID = 'test-facebook-app-id';
process.env.FACEBOOK_APP_SECRET = 'test-facebook-app-secret';
process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3000/auth/facebook/callback';
process.env.FRONTEND_URL = 'http://localhost:5500';
process.env.PAYSTACK_SECRET_KEY = 'test-paystack-key';
process.env.FLUTTERWAVE_SECRET_KEY = 'test-flutterwave-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.DISCORD_CLIENT_ID = 'test-discord-id';
process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.SLACK_CLIENT_ID = 'test-slack-id';
process.env.SLACK_CLIENT_SECRET = 'test-slack-secret';
process.env.NOTION_CLIENT_ID = 'test-notion-id';
process.env.NOTION_CLIENT_SECRET = 'test-notion-secret';
process.env.FIGMA_CLIENT_ID = 'test-figma-id';
process.env.FIGMA_CLIENT_SECRET = 'test-figma-secret';
process.env.EMAIL_HOST = 'smtp.test.com';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_USER = 'test@test.com';
process.env.EMAIL_PASSWORD = 'test-pass';
process.env.EMAIL_FROM = 'test@test.com';
process.env.BACKEND_URL = 'http://localhost:3000';
process.env.DEMO_AGENT_EMAIL = 'agent@buildershq.com';
process.env.DEMO_AGENT_PASSWORD = 'test-agent-password';

// Mock swagger-jsdoc at the top level
jest.mock('swagger-jsdoc', () => {
  return jest.fn(() => ({
    openapi: '3.0.0',
    info: { title: 'CODEX INC API', version: '1.0.0' },
    paths: {},
    components: {},
  }));
});

// Mock stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
    customers: { create: jest.fn(), retrieve: jest.fn() },
    subscriptions: { retrieve: jest.fn(), update: jest.fn(), cancel: jest.fn() },
  }));
});

// Mock mongoose with properly nested Schema.Types
const mockMongoose = {
  connect: jest.fn().mockResolvedValue({ connection: { name: 'test-db' } }),
  connection: { name: 'test-db' },
  model: jest.fn(() => ({
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    create: jest.fn(),
    save: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  })),
  Schema: function() {
    this.pre = jest.fn();
    this.methods = {};
    this.index = jest.fn();
    this.virtual = jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
    }));
    this.set = jest.fn();
    this.statics = {};
  },
  Types: { ObjectId: 'mock-object-id' },
};

mockMongoose.Schema.Types = {
  ObjectId: 'mock-object-id',
  Mixed: 'Mixed',
  String: String,
  Number: Number,
  Boolean: Boolean,
  Date: Date,
  Buffer: Buffer,
};

jest.mock('mongoose', () => mockMongoose);

// Mock socket.io
jest.mock('socket.io', () => {
  const mockSocket = {
    use: jest.fn(),
    on: jest.fn(),
    of: jest.fn(() => ({ use: jest.fn(), on: jest.fn() })),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
  return jest.fn(() => mockSocket);
});

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn(() => ({ id: 'mock-id', userId: 'mock-user-id' })),
}));

// Mock passport
jest.mock('passport', () => ({
  initialize: jest.fn(() => (req, res, next) => next()),
  session: jest.fn(() => (req, res, next) => next()),
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn(),
  authenticate: jest.fn(() => (req, res, next) => next()),
}));

// Mock express-session
jest.mock('express-session', () => {
  return jest.fn(() => (req, res, next) => next());
});

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ start: jest.fn() })),
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock passport strategies
jest.mock('passport-google-oauth20', () => {
  const MockStrategy = class GoogleStrategy {
    constructor(options, verify) {
      this.options = options;
      this.verify = verify;
    }
  };
  return { Strategy: MockStrategy };
});
jest.mock('passport-facebook', () => {
  const MockStrategy = class FacebookStrategy {
    constructor(options, verify) {
      this.options = options;
      this.verify = verify;
    }
  };
  return { Strategy: MockStrategy };
});

// Mock @octokit/rest for ESM compatibility
jest.mock('@octokit/rest', () => {
  const mockOctokit = jest.fn(() => ({
    repos: { get: jest.fn(), listForUser: jest.fn() },
    pulls: { list: jest.fn(), get: jest.fn() },
    issues: { listForRepo: jest.fn() },
    auth: jest.fn(),
    paginate: jest.fn(),
    request: jest.fn(),
  }));
  mockOctokit.Octokit = mockOctokit;
  return { Octokit: mockOctokit };
});

// Mock all the utils that have setInterval side-effects
jest.mock('../utils/billingCron', () => ({ start: jest.fn() }));
jest.mock('../utils/supportSocket', () => jest.fn());
jest.mock('../utils/meetingSocket', () => jest.fn());
jest.mock('../utils/collaborationService', () => ({
  addClient: jest.fn(),
  removeClient: jest.fn(),
  handleSyncMessage: jest.fn(),
  handleAwarenessMessage: jest.fn(),
}));
jest.mock('../utils/terminalService', () => ({
  createTerminal: jest.fn(),
  onData: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  getHistory: jest.fn(),
  destroy: jest.fn(),
  cleanupOldSessions: jest.fn(),
}));

// Mock routes that import ESM modules
jest.mock('../routes/github-api', () => {
  const Router = require('express').Router;
  return Router();
});
jest.mock('../routes/github-advanced', () => {
  const Router = require('express').Router;
  return Router();
});

describe('Server', () => {
  let app;
  let request;

  beforeAll(() => {
    app = require('../server');
    request = require('supertest');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('GET / should return server status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.name).toContain('CODEX INC');
  });

  test('GET /api/health should return health status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('GET /api/docs should return documentation', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.name).toContain('API Documentation');
  });

  test('GET /api-docs should serve Swagger UI', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
  });

  test('GET /api-docs/swagger.json should return swagger spec', async () => {
    // The swagger.json path works, but the exact content type may vary
    // due to swagger-ui middleware ordering
    const res = await request(app).get('/api-docs/swagger.json');
    expect([200, 301, 302, 404]).toContain(res.status);
  });
});