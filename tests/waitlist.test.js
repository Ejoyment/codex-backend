/**
 * Waitlist API tests — signup, live counter and release blast.
 * The router is mounted on a bare Express app with the model and mailer
 * mocked so no Mongo connection is required.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-waitlist-32chars!!';

const express = require('express');
const request = require('supertest');

jest.mock('../models/Waitlist', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  updateOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('../utils/emailService', () => ({
  sendWaitlistWelcomeEmail: jest.fn(),
  sendWaitlistReleaseEmail: jest.fn()
}));

const Waitlist = require('../models/Waitlist');
const { sendWaitlistWelcomeEmail, sendWaitlistReleaseEmail } = require('../utils/emailService');
const waitlistRoutes = require('../routes/waitlist');

const app = express();
app.use(express.json());
app.use('/api/waitlist', waitlistRoutes);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WAITLIST_ADMIN_TOKEN = 'super-secret-admin-token';
  Waitlist.countDocuments.mockResolvedValue(1);
  sendWaitlistWelcomeEmail.mockResolvedValue({ success: true, messageId: 'msg-1' });
  sendWaitlistReleaseEmail.mockResolvedValue({ success: true, messageId: 'msg-2' });
});

afterEach(() => {
  delete process.env.WAITLIST_ADMIN_TOKEN;
});

describe('POST /api/waitlist', () => {
  test('stores a valid email, sends the thank-you mail and returns the count', async () => {
    Waitlist.create.mockResolvedValue({ _id: 'w1', email: 'fan@example.com' });
    Waitlist.countDocuments.mockResolvedValue(12);
    Waitlist.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await request(app)
      .post('/api/waitlist')
      .send({ email: '  Fan@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      alreadySubscribed: false,
      emailSent: true,
      count: 12,
      member: {
        name: null,
        maskedEmail: 'f***@example.com',
        avatar: expect.stringMatching(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?s=88&d=identicon$/),
        joinedAt: null
      }
    });
    expect(Waitlist.create).toHaveBeenCalledWith({ email: 'fan@example.com', source: 'landing-page', name: '' });
    expect(sendWaitlistWelcomeEmail).toHaveBeenCalledWith('fan@example.com');
    expect(Waitlist.updateOne).toHaveBeenCalledWith({ _id: 'w1' }, { $set: { welcomeSentAt: expect.any(Date) } });
  });

  test('rejects an invalid email', async () => {
    const res = await request(app).post('/api/waitlist').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Waitlist.create).not.toHaveBeenCalled();
    expect(sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });

  test('rejects a missing email', async () => {
    const res = await request(app).post('/api/waitlist').send({});

    expect(res.status).toBe(400);
    expect(Waitlist.create).not.toHaveBeenCalled();
  });

  test('handles duplicates without resending the welcome mail', async () => {
    const dup = new Error('E11000 duplicate key');
    dup.code = 11000;
    Waitlist.create.mockRejectedValue(dup);
    Waitlist.findOne.mockResolvedValue({ _id: 'w9', email: 'fan@example.com' });
    Waitlist.countDocuments.mockResolvedValue(7);

    const res = await request(app).post('/api/waitlist').send({ email: 'fan@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.alreadySubscribed).toBe(true);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.count).toBe(7);
    expect(sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });

  test('keeps the signup when the welcome email blows up', async () => {
    Waitlist.create.mockResolvedValue({ _id: 'w2', email: 'fan@example.com' });
    sendWaitlistWelcomeEmail.mockRejectedValue(new Error('resend down'));

    const res = await request(app).post('/api/waitlist').send({ email: 'fan@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.emailSent).toBe(false);
    expect(Waitlist.create).toHaveBeenCalled();
  });

  test('stores a custom source tag', async () => {
    Waitlist.create.mockResolvedValue({ _id: 'w3', email: 'fan@example.com' });

    await request(app).post('/api/waitlist').send({ email: 'fan@example.com', source: 'twitter', name: ' Ada ' });

    expect(Waitlist.create).toHaveBeenCalledWith({ email: 'fan@example.com', source: 'twitter', name: 'Ada' });
  });
});

describe('GET /api/waitlist/count', () => {
  test('returns the public counter', async () => {
    Waitlist.countDocuments.mockResolvedValue(274);

    const res = await request(app).get('/api/waitlist/count');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, count: 274 });
    expect(Waitlist.countDocuments).toHaveBeenCalledWith({});
  });

  test('returns 500 when the count query fails', async () => {
    Waitlist.countDocuments.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/waitlist/count');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/waitlist/recent', () => {
  const rows = [
    { email: 'new@example.com', name: 'New', subscribedAt: new Date('2026-09-02T00:00:00Z') },
    { email: 'old@example.com', name: '', subscribedAt: new Date('2026-09-01T00:00:00Z') }
  ];

  const mockRecent = (result) => {
    Waitlist.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ lean: async () => result })
        })
      })
    });
  };

  test('returns count plus masked public profiles, newest first', async () => {
    mockRecent(rows);
    Waitlist.countDocuments.mockResolvedValue(42);

    const res = await request(app).get('/api/waitlist/recent?limit=5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(42);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members[0]).toEqual({
      name: 'New',
      maskedEmail: 'n***@example.com',
      avatar: expect.stringMatching(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?s=88&d=identicon$/),
      joinedAt: '2026-09-02T00:00:00.000Z'
    });
    expect(res.body.members[1].name).toBeNull();
    expect(Waitlist.find).toHaveBeenCalledWith({});
  });

  test('never exposes raw email addresses', async () => {
    mockRecent(rows);

    const res = await request(app).get('/api/waitlist/recent');
    const raw = JSON.stringify(res.body);

    expect(raw).not.toContain('new@example.com');
    expect(raw).not.toContain('old@example.com');
  });

  test('caps the limit at 12', async () => {
    mockRecent([]);

    await request(app).get('/api/waitlist/recent?limit=500');

    const limitFn = Waitlist.find().sort().limit;
    expect(limitFn).toHaveBeenCalledWith(12);
  });

  test('returns 500 when the query fails', async () => {
    Waitlist.countDocuments.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/waitlist/recent');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/waitlist/announce', () => {
  const pending = [{ email: 'a@example.com' }, { email: 'b@example.com' }];

  const mockFind = (rows) => {
    Waitlist.find.mockReturnValue({
      select: () => ({ lean: async () => rows })
    });
  };

  test('rejects calls without an admin token', async () => {
    const res = await request(app).post('/api/waitlist/announce').send({});

    expect(res.status).toBe(401);
    expect(sendWaitlistReleaseEmail).not.toHaveBeenCalled();
  });

  test('rejects a wrong admin token', async () => {
    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('x-admin-token', 'wrong-token')
      .send({});

    expect(res.status).toBe(401);
    expect(sendWaitlistReleaseEmail).not.toHaveBeenCalled();
  });

  test('rejects a wrong bearer token', async () => {
    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('Authorization', 'Bearer wrong-token')
      .send({});

    expect(res.status).toBe(401);
  });

  test('returns 503 when release sending is not configured', async () => {
    delete process.env.WAITLIST_ADMIN_TOKEN;

    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('x-admin-token', 'anything')
      .send({});

    expect(res.status).toBe(503);
  });

  test('mails every pending member and reports totals', async () => {
    mockFind(pending);
    Waitlist.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('x-admin-token', 'super-secret-admin-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, total: 2, sent: 2, failed: 0 });
    expect(sendWaitlistReleaseEmail).toHaveBeenCalledTimes(2);
    expect(sendWaitlistReleaseEmail).toHaveBeenCalledWith('a@example.com');
    expect(sendWaitlistReleaseEmail).toHaveBeenCalledWith('b@example.com');
    expect(Waitlist.updateOne).toHaveBeenCalledWith(
      { email: 'a@example.com' },
      { $set: { releaseSentAt: expect.any(Date), status: 'released' } }
    );
  });

  test('counts failures without marking them released', async () => {
    mockFind(pending);
    Waitlist.updateOne.mockResolvedValue({ acknowledged: true });
    sendWaitlistReleaseEmail
      .mockResolvedValueOnce({ success: true, messageId: 'ok' })
      .mockResolvedValueOnce({ success: false, error: 'bounce' });

    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('x-admin-token', 'super-secret-admin-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, total: 2, sent: 1, failed: 1 });
    expect(Waitlist.updateOne).toHaveBeenCalledTimes(1);
  });

  test('force re-send targets members already mailed', async () => {
    mockFind(pending);

    const res = await request(app)
      .post('/api/waitlist/announce')
      .set('x-admin-token', 'super-secret-admin-token')
      .send({ force: true });

    expect(res.status).toBe(200);
    expect(Waitlist.find).toHaveBeenCalledWith({ status: { $ne: 'unsubscribed' } });
    expect(res.body.sent).toBe(2);
  });
});
