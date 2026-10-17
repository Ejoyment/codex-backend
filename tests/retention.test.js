/**
 * Rec 11 — retention + TTL pass.
 *
 * 1. TTL indexes exist on every expiring collection (TerminalLog, Sandbox,
 *    Invitation, AuditLog, DebugHandoff, CollaborationSession, + pre-existing
 *    Notification/Deployment/OTP/DebugRoom).
 * 2. Unbounded in-document arrays are capped at every write site: file
 *    versions (silent trim), terminal streams ($slice), agent logs ($slice),
 *    reactions/members/ticket-messages (loud 400).
 * 3. DebugRoom sweeper contract: expired/idle rooms reaped, active kept
 *    (the sweeper was functional — these tests lock it).
 * 4. SupportTicket has usable indexes; DebugHandoff's dead status index is gone.
 *
 * No database: all model access is stubbed or in-memory.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
mongoose.set('bufferCommands', false);

const USER = '507f1f77bcf86cd799439011';
const COMPANY = '507f1f77bcf86cd799439022';
const CHANNEL_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const FILE_ID = '507f1f77bcf86cd799439055';

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = USER;
    req.user = { _id: USER };
    next();
  },
}));
jest.doMock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.doMock('../models/Company', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.doMock('../utils/unifiedStateGraph', () => ({ registerTerminalOutput: jest.fn() }));
jest.doMock('../utils/vpsShell', () => ({ VpsShell: jest.fn(), terminalTransportEnabled: false }));

const retention = require('../utils/retention');
const TerminalLog = require('../models/TerminalLog');
const EphemeralSandbox = require('../models/EphemeralSandbox');
const Invitation = require('../models/Invitation');
const AuditLog = require('../models/AuditLog');
const DebugHandoff = require('../models/DebugHandoff');
const CollaborationSession = require('../models/CollaborationSession');
const SupportTicket = require('../models/SupportTicket');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const terminalService = require('../utils/terminalService');
const roomService = require('../server/services/roomService');
const DebugRoom = require('../server/models/DebugRoomModel');

const messagingRouter = require('../routes/messaging');
const supportRouter = require('../routes/support');
const codeEditorRouter = require('../routes/code-editor');

const app = express();
app.use(express.json());
app.use('/api/messaging', messagingRouter);
app.use('/api/support', supportRouter);
app.use('/api/code-editor', codeEditorRouter);

const signUser = () => jwt.sign({ userId: USER }, process.env.JWT_SECRET);

afterEach(() => {
  jest.restoreAllMocks();
});

// All indexes declared on a schema: [[fields, options], ...].
const schemaIndexes = (model) => model.schema.indexes();
const hasTtlOn = (model, field) =>
  schemaIndexes(model).some(([fields, options]) => fields[field] === 1 && options && typeof options.expireAfterSeconds === 'number');

describe('TTL indexes', () => {
  test.each([
    ['TerminalLog', TerminalLog, 'expiresAt'],
    ['EphemeralSandbox', EphemeralSandbox, 'expiresAt'],
    ['Invitation', Invitation, 'expiresAt'],
    ['AuditLog', AuditLog, 'expiresAt'],
    ['DebugHandoff', DebugHandoff, 'expiresAt'],
    ['CollaborationSession', CollaborationSession, 'expiresAt'],
    ['Notification', Notification, 'createdAt'],
  ])('%s expires via TTL', (name, model, field) => {
    expect(hasTtlOn(model, field)).toBe(true);
  });

  test('Invitation TTL preserves the 7-day default', () => {
    const doc = new Invitation({ email: 'a@b.c', company: new mongoose.Types.ObjectId(), invitedBy: new mongoose.Types.ObjectId() });
    const days = (doc.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  test('AuditLog retention honors AUDIT_LOG_RETENTION_DAYS', () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '30';
    const doc = new AuditLog({ company: new mongoose.Types.ObjectId(), event: 'x' });
    const days = (doc.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    delete process.env.AUDIT_LOG_RETENTION_DAYS;
  });

  test.each([
    ['TerminalLog', TerminalLog, 'TERMINAL_LOG_TTL_DAYS', 3,
      () => ({ terminalId: 't', userId: new mongoose.Types.ObjectId() })],
    ['EphemeralSandbox', EphemeralSandbox, 'SANDBOX_TTL_HOURS', null,
      () => ({ sandboxKey: 'k', createdBy: new mongoose.Types.ObjectId() })],
    ['Invitation', Invitation, 'INVITATION_TTL_DAYS', 3,
      () => ({ email: 'a@b.c', company: new mongoose.Types.ObjectId(), invitedBy: new mongoose.Types.ObjectId() })],
  ])('%s honors %s', (_name, model, envVar, daysVal, makeDoc) => {
    if (daysVal === null) {
      process.env[envVar] = '48';
      const doc = new model(makeDoc());
      const hours = (doc.expiresAt - Date.now()) / (60 * 60 * 1000);
      expect(hours).toBeGreaterThan(47);
      expect(hours).toBeLessThan(49);
    } else {
      process.env[envVar] = String(daysVal);
      const doc = new model(makeDoc());
      const days = (doc.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(daysVal - 0.1);
      expect(days).toBeLessThan(daysVal + 0.1);
    }
    delete process.env[envVar];
  });

  test('markExpired pulls expiresAt forward for prompt reaping', async () => {
    const doc = new Invitation({ email: 'a@b.c', company: new mongoose.Types.ObjectId(), invitedBy: new mongoose.Types.ObjectId() });
    doc.save = jest.fn(async function () { return this; });
    await doc.markExpired();
    expect(doc.status).toBe('expired');
    expect(doc.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('index hygiene', () => {
  test('DebugHandoff has no index on the nonexistent status field', () => {
    const indexedFields = schemaIndexes(DebugHandoff).flatMap(([fields]) => Object.keys(fields));
    expect(indexedFields).not.toContain('status');
  });

  test('SupportTicket has queue/owner/assignee indexes', () => {
    const indexes = schemaIndexes(SupportTicket).map(([fields]) => JSON.stringify(fields));
    expect(indexes).toContain(JSON.stringify({ userId: 1, status: 1, updatedAt: -1 }));
    expect(indexes).toContain(JSON.stringify({ status: 1, updatedAt: -1 }));
    expect(indexes).toContain(JSON.stringify({ assignedTo: 1, status: 1 }));
  });
});

describe('retention helpers', () => {
  test('trimToLast keeps the tail', () => {
    expect(retention.trimToLast([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
    expect(retention.trimToLast([1, 2], 3)).toEqual([1, 2]);
  });

  test('slicedPush builds an atomic capped push', () => {
    expect(retention.slicedPush({ a: 1 }, 10)).toEqual({ $each: [{ a: 1 }], $slice: -10 });
  });
});

describe('terminal stream cap ($slice)', () => {
  test('_persistEntry pushes with $slice -2000', async () => {
    terminalService.terminals.set('sess-1', { logId: new mongoose.Types.ObjectId() });
    let seen;
    jest.spyOn(TerminalLog, 'updateOne').mockImplementation(async (filter, update) => {
      seen = update;
      return { modifiedCount: 1 };
    });
    try {
      await terminalService._persistEntry('sess-1', 'output', 'hello');
    } finally {
      terminalService.terminals.delete('sess-1');
    }
    expect(seen.$push.entries).toEqual({
      $each: [expect.objectContaining({ type: 'output', data: 'hello' })],
      $slice: -2000,
    });
    expect(seen.$inc).toEqual({ commandCount: 0 });
  });
});

describe('file version cap (silent trim)', () => {
  const fileDoc = (versionCount) =>
    new CodeFile({
      _id: FILE_ID,
      name: 'a.js',
      language: 'javascript',
      content: 'new-content',
      company: new mongoose.Types.ObjectId(COMPANY),
      createdBy: new mongoose.Types.ObjectId(USER),
      path: '/a.js',
      versions: Array.from({ length: versionCount }, (_, i) => ({ content: `v${i}` })),
    });

  test('PUT trims versions to 50 and still saves', async () => {
    const doc = fileDoc(60);
    doc.save = jest.fn(async function () { return this; });
    doc.populate = jest.fn(async function () { return this; });
    jest.spyOn(CodeFile, 'findById').mockResolvedValue(doc);
    const res = await request(app).put(`/api/code-editor/files/${FILE_ID}`).send({ content: 'brand-new' });
    expect(res.status).toBe(200);
    // 60 existing + 1 new version, trimmed back to the cap:
    expect(doc.versions.length).toBe(50);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('reaction cap (loud 400)', () => {
  const messageDoc = (reactionCount) => ({
    _id: MSG_ID,
    channel: CHANNEL_ID,
    sender: USER,
    reactions: Array.from({ length: reactionCount }, (_, i) => ({ emoji: `e${i}`, user: `u${i}` })),
    save: jest.fn(async function () { return this; }),
  });

  beforeEach(() => {
    // Chainable + awaitable, like a real mongoose query (.select().then()).
    const ch = { members: [{ user: USER }] };
    const q = { select: () => q, then: (resolve, reject) => Promise.resolve(ch).then(resolve, reject) };
    jest.spyOn(Channel, 'findById').mockImplementation(() => q);
  });

  test('201st reaction is rejected', async () => {
    jest.spyOn(Message, 'findById').mockResolvedValue(messageDoc(200));
    const res = await request(app)
      .post(`/api/messaging/messages/${MSG_ID}/reactions`)
      .send({ emoji: 'one-too-many' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reaction limit/i);
  });

  test('200th reaction still lands', async () => {
    const doc = messageDoc(199);
    jest.spyOn(Message, 'findById').mockResolvedValue(doc);
    const res = await request(app)
      .post(`/api/messaging/messages/${MSG_ID}/reactions`)
      .send({ emoji: 'just-fits' });
    expect(res.status).toBe(200);
    expect(doc.reactions.length).toBe(200);
  });
});

describe('channel member cap (loud 400)', () => {
  test('2001st member is rejected', async () => {
    const members = [{ user: USER, role: 'admin' }];
    for (let i = 0; i < 1999; i++) members.push({ user: `member-${i}`, role: 'member' });
    jest.spyOn(Channel, 'findById').mockResolvedValue({
      _id: CHANNEL_ID,
      company: COMPANY,
      members,
      save: jest.fn(async function () { return this; }),
      populate: jest.fn(async function () { return this; }),
    });
    Company.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: COMPANY }) }) });
    const res = await request(app)
      .post(`/api/messaging/channels/${CHANNEL_ID}/members`)
      .send({ userId: '507f1f77bcf86cd799439099' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/member limit/i);
  });
});

describe('support ticket thread cap (loud 400)', () => {
  const ticketDoc = (messageCount) => ({
    _id: 't1',
    ticketId: 'TKT-1',
    userId: USER,
    guestEmail: null,
    status: 'open',
    messages: Array.from({ length: messageCount }, (_, i) => ({ sender: 'user', message: `m${i}` })),
    save: jest.fn(async function () { return this; }),
  });

  test('1001st message is rejected over REST', async () => {
    jest.spyOn(SupportTicket, 'findOne').mockResolvedValue(ticketDoc(1000));
    const res = await request(app)
      .post('/api/support/tickets/TKT-1/messages')
      .set('Authorization', `Bearer ${signUser()}`)
      .send({ message: 'one too many' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/follow-up ticket/i);
  });

  test('1000th message still lands', async () => {
    const doc = ticketDoc(999);
    jest.spyOn(SupportTicket, 'findOne').mockResolvedValue(doc);
    const res = await request(app)
      .post('/api/support/tickets/TKT-1/messages')
      .set('Authorization', `Bearer ${signUser()}`)
      .send({ message: 'just fits' });
    expect(res.status).toBe(200);
    expect(doc.messages.length).toBe(1000);
  });
});

describe('DebugRoom sweeper contract', () => {
  test('expired and idle rooms are reaped, active rooms kept', async () => {
    let seen;
    jest.spyOn(DebugRoom, 'deleteMany').mockImplementation(async (filter) => {
      seen = filter;
      return { deletedCount: 2 };
    });
    const now = new Date('2026-10-05T12:00:00Z');
    const result = await roomService.cleanupExpiredRooms({ now });
    expect(result).toEqual({ deleted: 2 });
    expect(seen).toEqual({
      $or: [
        { expiresAt: { $lte: now } },
        { lastActivityAt: { $lte: new Date(now.getTime() - roomService.IDLE_TIMEOUT_MS) } },
      ],
    });
  });

  test('startSweeper is a singleton that can be stopped', () => {
    const first = roomService.startSweeper(60000);
    expect(roomService.startSweeper(60000)).toBe(first);
    roomService.stopSweeper();
  });
});
