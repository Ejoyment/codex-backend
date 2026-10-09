/**
 * Tenant-isolation tests for utils/collabRealtimeSocket.js (audit rec 7).
 *
 * Real socket.io server + real client sockets on the /collab namespace;
 * only the database is stubbed. Proves: existing sessions can only be joined
 * by creator/participant/company-member, sessionId-scoped packets from
 * non-members are dropped (design:change injection), unscoped audio signaling
 * is gone, and room:join can no longer reach agent/session rooms.
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/CollaborationSession', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../models/DesignSyncSession', () => ({ findOne: jest.fn() }));
jest.mock('../models/EphemeralSandbox', () => ({ findOne: jest.fn() }));
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));

const CollaborationSession = require('../models/CollaborationSession');
const EphemeralSandbox = require('../models/EphemeralSandbox');
const Company = require('../models/Company');
const collabRealtimeSocket = require('../utils/collabRealtimeSocket');
const User = require('../models/User');
const { clearLivenessCache } = require('../middleware/auth');

let server;
let io;
let port;

let sessions = {};
let sandboxes = {};
// Discriminating membership mock (see meeting-socket-access.test.js):
// only currentMember (or companyA's owner userA) passes.
let currentMember = null;
const isMemberQuery = (q) => {
  if (String(q?._id) !== 'companyA') return false;
  const ors = q?.$or || [];
  return ors.some((c) => String(c.owner) === 'userA' || (c['members.user'] && String(c['members.user']) === currentMember));
};

const sessionDoc = (over = {}) => ({
  _id: 'sessA', sessionId: 'sessA', companyId: 'companyA', createdBy: 'userA',
  participants: [
    { userId: 'userM', name: 'Member', color: '#0f0', joinedAt: new Date(), lastSeen: new Date() },
  ],
  audioChannelId: 'audio_sessA',
  save: jest.fn(async function () { return this; }),
  ...over,
});
const sandboxDoc = (over = {}) => ({
  _id: 'sb1', sandboxKey: 'sb_0123456789abcdef0123', createdBy: 'userA',
  companyId: 'companyA', status: 'ready',
  ...over,
});

const connect = (userId) =>
  new Promise((resolve, reject) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    const socket = ioClient(`http://localhost:${port}/collab`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const once = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const received = (socket, event, ms = 600) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

beforeAll(async () => {
  server = http.createServer();
  io = new Server(server, { cors: { origin: '*' } });
  collabRealtimeSocket(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  // Socket liveness: accounts resolve as live unless a test says otherwise.
  jest.spyOn(User, 'exists').mockResolvedValue({ _id: 'live' });
  currentMember = null;
  sessions = { sessA: sessionDoc() };
  sandboxes = { sb_0123456789abcdef0123: sandboxDoc() };
  CollaborationSession.findOne.mockImplementation(async (q) => {
    if (q?.sessionId) return sessions[q.sessionId] || null;
    if (q?._id) return Object.values(sessions).find((s) => String(s._id) === String(q._id)) || null;
    return null;
  });
  CollaborationSession.create.mockImplementation(async (doc) => {
    const created = sessionDoc({ _id: 'new1', ...doc, participants: [], save: jest.fn(async function () { return this; }) });
    sessions[doc.sessionId] = created;
    return created;
  });
  EphemeralSandbox.findOne.mockImplementation(async (q) => sandboxes[q?.sandboxKey] || null);
  Company.findOne.mockImplementation((q) => ({
    select: () => ({ lean: async () => (isMemberQuery(q) ? { _id: 'companyA' } : null) }),
  }));
});

afterEach(() => {
  io.of('/collab').sockets.forEach((s) => s.disconnect(true));
});

describe('connection liveness', () => {
  test('deleted/banned account cannot connect', async () => {
    clearLivenessCache();
    User.exists.mockResolvedValueOnce(null);
    await expect(connect('dead-user-9')).rejects.toThrow(/no longer active/i);
  });
});

describe('session:join access', () => {
  test('stranger cannot join an existing company session', async () => {
    const s = await connect('userB');
    s.emit('session:join', { sessionId: 'sessA' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    expect(await received(s, 'session:joined')).toBe(false);
    expect(await received(s, 'presence:update')).toBe(false);
    s.disconnect();
  });

  test('company member can join', async () => {
    currentMember = 'userB';
    const s = await connect('userB');
    s.emit('session:join', { sessionId: 'sessA' });
    const joined = await once(s, 'session:joined');
    expect(joined.sessionId).toBe('sessA');
    expect(joined.participants.length).toBeGreaterThanOrEqual(1);
    s.disconnect();
  });

  test('creator can rejoin without company membership', async () => {
    const s = await connect('userA');
    s.emit('session:join', { sessionId: 'sessA' });
    await once(s, 'session:joined');
    s.disconnect();
  });

  test('existing participant can rejoin', async () => {
    const s = await connect('userM');
    s.emit('session:join', { sessionId: 'sessA' });
    await once(s, 'session:joined');
    s.disconnect();
  });

  test('creating a session with a foreign companyId is rejected', async () => {
    const s = await connect('userB');
    s.emit('session:join', { sessionId: 'fresh', companyId: 'companyA' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    expect(CollaborationSession.create).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('creating a company-less session works', async () => {
    const s = await connect('userB');
    s.emit('session:join', { sessionId: 'fresh' });
    const joined = await once(s, 'session:joined');
    expect(joined.sessionId).toBe('fresh');
    expect(CollaborationSession.create).toHaveBeenCalled();
    s.disconnect();
  });
});

describe('sessionId-scoped packet guard', () => {
  test('design:change from a non-member is dropped, not delivered', async () => {
    const victim = await connect('userM');
    victim.emit('session:join', { sessionId: 'sessA' });
    await once(victim, 'session:joined');

    const attacker = await connect('userB'); // never joined
    attacker.emit('design:change', { sessionId: 'sessA', code: 'pwned', language: 'js' });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this session/i);
    expect(await received(victim, 'design:change')).toBe(false);
    victim.disconnect();
    attacker.disconnect();
  });

  test('design:change from a member is delivered', async () => {
    const a = await connect('userA');
    a.emit('session:join', { sessionId: 'sessA' });
    await once(a, 'session:joined');
    const b = await connect('userM');
    b.emit('session:join', { sessionId: 'sessA' });
    await once(b, 'session:joined');

    const got = once(a, 'design:change');
    b.emit('design:change', { sessionId: 'sessA', code: 'let x = 1', language: 'js' });
    const change = await got;
    expect(change.code).toBe('let x = 1');
    a.disconnect();
    b.disconnect();
  });

  test('awareness:cursor from a non-member is dropped', async () => {
    const victim = await connect('userM');
    victim.emit('session:join', { sessionId: 'sessA' });
    await once(victim, 'session:joined');

    const attacker = await connect('userB');
    attacker.emit('awareness:cursor', { sessionId: 'sessA', cursor: { line: 1, ch: 0 } });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this session/i);
    expect(await received(victim, 'awareness:cursor')).toBe(false);
    victim.disconnect();
    attacker.disconnect();
  });

  test('audio:signal is session-scoped and delivered to peers', async () => {
    const a = await connect('userA');
    a.emit('session:join', { sessionId: 'sessA' });
    await once(a, 'session:joined');
    const b = await connect('userM');
    b.emit('session:join', { sessionId: 'sessA' });
    await once(b, 'session:joined');

    const got = once(a, 'audio:signal');
    b.emit('audio:signal', { sessionId: 'sessA', data: { sdp: 'offer' } });
    const sig = await got;
    expect(sig.from).toBe('userM');
    expect(sig.data.sdp).toBe('offer');
    a.disconnect();
    b.disconnect();
  });
});

describe('room:join authorization', () => {
  test('agent:<id> rooms are denied (agent-progress leak)', async () => {
    const s = await connect('userB');
    s.emit('room:join', { room: 'agent:userA' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('session:<id> rooms are denied', async () => {
    const s = await connect('userB');
    s.emit('room:join', { room: 'session:sessA' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('unknown sandbox key → not found', async () => {
    const s = await connect('userA');
    s.emit('room:join', { room: 'sandbox:sb_deadbeefdeadbeefdead' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/not found/i);
    s.disconnect();
  });

  test('non-member cannot join sandbox room; member can', async () => {
    const stranger = await connect('userB');
    stranger.emit('room:join', { room: 'sandbox:sb_0123456789abcdef0123' });
    const err = await once(stranger, 'error');
    expect(err.message).toMatch(/denied/i);
    stranger.disconnect();

    currentMember = 'userB';
    const member = await connect('userB');
    member.emit('room:join', { room: 'sandbox:sb_0123456789abcdef0123' });
    await once(member, 'room:joined');
    const got = received(member, 'sandbox:status', 1500);
    io.of('/collab').to('sandbox:sb_0123456789abcdef0123')
      .emit('sandbox:status', { sandboxKey: 'sb_0123456789abcdef0123', status: 'ready' });
    expect(await got).toBe(true);
    member.disconnect();
  });

  test('expired sandbox is denied even for the owner', async () => {
    sandboxes.sb_0123456789abcdef0123.status = 'expired';
    const s = await connect('userA');
    s.emit('room:join', { room: 'sandbox:sb_0123456789abcdef0123' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/expired/i);
    s.disconnect();
  });
});
