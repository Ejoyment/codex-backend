/**
 * Push-conflict + delete endpoints (editor.js triage follow-ups) and the
 * subscription usage block (settings billing tab).
 *
 * - POST /api/github-advanced/push: no-op when the tree matches (no empty
 *   commits); 409 NON_FAST_FORWARD instead of retry-clobbering concurrent
 *   pushes.
 * - POST /api/github-advanced/delete: 400 without owner/repo/path; happy
 *   path returns the commit SHA (GitHub pseudo-id deletes previously 404'd).
 * - GET /api/subscription/current exposes usage meters (credits + compute).
 *
 * No database, no network: githubService + trial middleware stubbed.
 */
const express = require('express');
const request = require('supertest');

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { userId: '507f1f77bcf86cd799439011' };
    next();
  },
}));
jest.doMock('../utils/githubService', () => ({
  pushCommit: jest.fn(),
  deleteFile: jest.fn(),
}));
jest.doMock('../middleware/trial', () => ({
  getOrCreateSubscription: jest.fn(),
  checkTrialStatus: (req, res, next) => next(),
}));
jest.doMock('stripe', () => jest.fn(() => ({})));

const githubService = require('../utils/githubService');
const { getOrCreateSubscription } = require('../middleware/trial');
const githubRouter = require('../routes/github-advanced');
const subscriptionRouter = require('../routes/subscription');

const app = express();
app.use(express.json());
app.use('/api/github-advanced', githubRouter);
app.use('/api/subscription', subscriptionRouter);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/github-advanced/push', () => {
  const pushBody = {
    owner: 'o',
    repo: 'r',
    branch: 'main',
    files: [{ path: 'a.js', content: 'x' }],
  };

  test('no-op push returns success + noop (no empty commit)', async () => {
    githubService.pushCommit.mockResolvedValue({ commit: null, branch: 'main', noop: true });
    const res = await request(app).post('/api/github-advanced/push').send(pushBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.noop).toBe(true);
    expect(res.body.commitSha).toBe(null);
  });

  test('non-fast-forward returns 409, never a rebased overwrite', async () => {
    const err = new Error('Branch moved while pushing');
    err.code = 'NON_FAST_FORWARD';
    githubService.pushCommit.mockRejectedValue(err);
    const res = await request(app).post('/api/github-advanced/push').send(pushBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NON_FAST_FORWARD');
  });

  test('other push failures stay 502', async () => {
    githubService.pushCommit.mockRejectedValue(new Error('rate limited'));
    const res = await request(app).post('/api/github-advanced/push').send(pushBody);
    expect(res.status).toBe(502);
  });
});

describe('POST /api/github-advanced/delete', () => {
  test('400 without owner/repo/path', async () => {
    const res = await request(app).post('/api/github-advanced/delete').send({ owner: 'o' });
    expect(res.status).toBe(400);
  });

  test('happy path returns the commit SHA', async () => {
    githubService.deleteFile.mockResolvedValue({ commit: { sha: 'abc123' } });
    const res = await request(app)
      .post('/api/github-advanced/delete')
      .send({ owner: 'o', repo: 'r', branch: 'main', path: '/old.js' });
    expect(res.status).toBe(200);
    expect(res.body.commitSha).toBe('abc123');
    expect(githubService.deleteFile).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011', 'o', 'r', 'old.js', expect.anything(), 'main'
    );
  });
});

describe('GET /api/subscription/current usage block', () => {
  test('exposes credits + compute meters', async () => {
    getOrCreateSubscription.mockResolvedValue({
      tier: 'pro',
      status: 'active',
      features: {},
      pricing: { amount: 20, interval: 'monthly' },
      creditPool: { usedThisMonth: 7 },
      cloudComputeHours: { usedThisMonth: 2 },
      getMonthlyCreditLimit: () => 20,
      getCloudComputeHours: () => 10,
    });
    const res = await request(app).get('/api/subscription/current');
    expect(res.status).toBe(200);
    expect(res.body.subscription.usage).toEqual({
      credits: { used: 7, limit: 20 },
      computeHours: { used: 2, limit: 10 },
    });
  });
});
