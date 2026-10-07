/**
 * Rec 13 — API contract: every error response uses the canonical envelope
 * { success: false, message } (see utils/apiResponse.js). No bare
 * `{ error }` shapes, no missing success flag.
 *
 * Samples the main routers: each test triggers a real error path and asserts
 * the envelope. No database: auth is stubbed pass-through except where the
 * 401 itself comes from the real authenticateToken.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
// Unstubbed model calls fail fast instead of buffering on a missing DB.
mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { _id: '507f1f77bcf86cd799439011' };
    next();
  },
}));
jest.doMock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.doMock('../models/Company', () => ({ findOne: jest.fn(), findById: jest.fn() }));

const messagingRouter = require('../routes/messaging');
const supportRouter = require('../routes/support');
const mcpRouter = require('../routes/mcp');
const rtcRouter = require('../routes/rtc');
const SupportTicket = require('../models/SupportTicket');
const Company = require('../models/Company');
const apiResponse = require('../utils/apiResponse');

const app = express();
app.use(express.json());
app.use('/api/messaging', messagingRouter);
app.use('/api/support', supportRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/rtc', rtcRouter);

afterEach(() => {
  jest.restoreAllMocks();
});

const expectEnvelope = (res, status) => {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(typeof res.body.message).toBe('string');
  expect(res.body.error).toBeUndefined();
};

describe('error envelope', () => {
  test('messaging: missing companyId → 400 envelope', async () => {
    const res = await request(app).get('/api/messaging/channels');
    expectEnvelope(res, 400);
  });

  test('messaging: unknown channel → 404 envelope', async () => {
    const Channel = require('../models/Channel');
    const q = { populate: () => q, then: (resolve, reject) => Promise.resolve(null).then(resolve, reject) };
    jest.spyOn(Channel, 'findById').mockImplementation(() => q);
    const res = await request(app).get('/api/messaging/channels/507f1f77bcf86cd799439099');
    expectEnvelope(res, 404);
  });

  test('support: missing token → 401 envelope (real auth)', async () => {
    const res = await request(app).post('/api/support/tickets/TKT-1/messages').send({ message: 'hi' });
    expectEnvelope(res, 401);
  });

  test('support: unknown ticket → 404 envelope', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: '507f1f77bcf86cd799439011' },
      process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars'
    );
    jest.spyOn(SupportTicket, 'findOne').mockResolvedValue(null);
    const res = await request(app)
      .post('/api/support/tickets/NOPE/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'hi' });
    // findById fallback: invalid ObjectId is skipped, ticket stays missing.
    expectEnvelope(res, 404);
  });

  test('mcp: unknown company → 404 envelope', async () => {
    Company.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/mcp/company/507f1f77bcf86cd799439022');
    expectEnvelope(res, 404);
  });

  test('rtc: success envelope has success:true', async () => {
    const res = await request(app).get('/api/rtc/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
  });
});

describe('_id convention: list items always carry _id', () => {
  test('mcp servers carry _id', async () => {
    const Company = require('../models/Company');
    const McpServer = require('../models/McpServer');
    Company.findById.mockResolvedValue({
      _id: 'c1',
      owner: { toString: () => '507f1f77bcf86cd799439011' },
      members: [],
    });
    const serverDoc = new McpServer({
      _id: new (require('mongoose').Types.ObjectId)(),
      company: new (require('mongoose').Types.ObjectId)(),
      createdBy: new (require('mongoose').Types.ObjectId)(),
      name: 's',
    });
    jest.spyOn(McpServer, 'find').mockReturnValue({ sort: async () => [serverDoc] });
    const res = await request(app).get('/api/mcp/company/c1');
    expect(res.status).toBe(200);
    for (const s of res.body.servers) {
      expect(typeof s._id).toBe('string');
    }
  });
});

describe('apiResponse helpers', () => {  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  test('ok wraps data with success:true', () => {
    const r = res();
    apiResponse.ok(r, { a: 1 });
    expect(r.json).toHaveBeenCalledWith({ success: true, a: 1 });
  });

  test('fail carries status/message/code, never an error key', () => {
    const r = res();
    apiResponse.fail(r, 403, 'nope', 'DENIED');
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith({ success: false, message: 'nope', code: 'DENIED' });
  });

  test('shortcuts use the right codes', () => {
    const r = res();
    apiResponse.notFound(r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({ success: false, message: 'Not found' });
  });
});
