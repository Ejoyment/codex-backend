/**
 * Rec 8 — auth hardening.
 *
 * A. The 5 inline jwt.verify calls in routes/auth.js (/me, /update-profile,
 *    /change-password, /delete-account, /complete-onboarding) now go through
 *    authenticateToken — locking the liveness check (deleted/banned accounts)
 *    onto routes that previously skipped it. Also asserts the new auth
 *    semantics: missing token 401, garbage token 403 (was 500 via catch).
 * B. Fail-closed liveness: if the User probe throws (DB down), the request is
 *    rejected instead of authenticated.
 * D. Server-side rate limiters on write endpoints that relied only on the
 *    client-side limiter in lib/api.js. Deterministic check: the limiter
 *    middleware instance must be wired on each route (limits themselves are
 *    skipped in NODE_ENV=test so the suite stays deterministic).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

// ai-pair pulls ESM-only SDKs through these services (handlers don't run in
// these tests, so stub the modules before the router loads).
jest.doMock('../utils/aiService', () => ({}));
jest.doMock('../utils/githubService', () => ({}));

const authRouter = require('../routes/auth');
const messagingRouter = require('../routes/messaging');
const supportRouter = require('../routes/support');
const aiPairRouter = require('../routes/ai-pair');
const agentV1Router = require('../routes/agent-v1');

const User = require('../models/User');
const { clearLivenessCache } = require('../middleware/auth');

const {
  messageSendLimiter,
  supportTicketLimiter,
  supportReplyLimiter,
  aiChatLimiter,
  agentDelegateLimiter,
} = require('../middleware/rateLimits');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const sign = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

beforeEach(() => {
  clearLivenessCache();
  jest.restoreAllMocks();
});

describe('single authenticateToken on the 5 former inline-verify routes', () => {
  test('GET /me without token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/access token required/i);
  });

  test('GET /me with garbage token → 403, not 500', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  test('GET /me with token for a deleted account → 403 Account is no longer active', async () => {
    jest.spyOn(User, 'exists').mockResolvedValueOnce(null);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${sign('dead-user-1')}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no longer active/i);
  });

  test('GET /me with live account reaches the handler (liveness passes, user 404)', async () => {
    jest.spyOn(User, 'exists').mockResolvedValueOnce({ _id: 'live-user-2' });
    // No DB in the minimal app: the handler's findById().select() chain is stubbed to miss.
    jest.spyOn(User, 'findById').mockReturnValueOnce({ select: () => Promise.resolve(null) });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sign('507f1f77bcf86cd799439099')}`);
    // Middleware passed (liveness OK); handler looked the user up and 404'd.
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  test('PUT /update-profile without token → 401', async () => {
    const res = await request(app).put('/api/auth/update-profile').send({ fullName: 'x' });
    expect(res.status).toBe(401);
  });

  test('POST /change-password with garbage token → 403', async () => {
    const res = await request(app).post('/api/auth/change-password').set('Authorization', 'Bearer garbage').send({});
    expect(res.status).toBe(403);
  });

  test('DELETE /delete-account without token → 401', async () => {
    const res = await request(app).delete('/api/auth/delete-account').send({ confirm: 'DELETE' });
    expect(res.status).toBe(401);
  });

  test('POST /complete-onboarding with garbage token → 403', async () => {
    const res = await request(app).post('/api/auth/complete-onboarding').set('Authorization', 'Bearer garbage').send({});
    expect(res.status).toBe(403);
  });
});

describe('fail-closed liveness', () => {
  test('User probe throwing (DB down) rejects instead of authenticating', async () => {
    jest.spyOn(User, 'exists').mockRejectedValueOnce(new Error('db unavailable'));
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${sign('dbdown-user-3')}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no longer active/i);
  });
});

describe('server-side write limiters are wired', () => {
  const routeHandlers = (router, method, path) => {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s) => s.handle);
  };

  test('POST /messages carries the send limiter', () => {
    expect(routeHandlers(messagingRouter, 'post', '/messages')).toContain(messageSendLimiter);
  });

  test('POST /tickets carries the ticket limiter', () => {
    expect(routeHandlers(supportRouter, 'post', '/tickets')).toContain(supportTicketLimiter);
  });

  test('POST /tickets/:ticketId/messages carries the reply limiter', () => {
    expect(routeHandlers(supportRouter, 'post', '/tickets/:ticketId/messages')).toContain(supportReplyLimiter);
  });

  test('POST /chat carries the AI limiter', () => {
    expect(routeHandlers(aiPairRouter, 'post', '/chat')).toContain(aiChatLimiter);
  });

  test('POST /delegate carries the delegate limiter', () => {
    expect(routeHandlers(agentV1Router, 'post', '/delegate')).toContain(agentDelegateLimiter);
  });
});
