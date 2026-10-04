/**
 * Tenant-isolation tests for utils/meetingSocket.js (audit rec 7).
 *
 * A real socket.io server + real client sockets on the /meeting namespace;
 * only the database is stubbed. Proves: unknown/foreign rooms can't be
 * joined (no peer-list or broadcast leakage), only hosts can end meetings,
 * and cross-room spoof emits are dropped by the packet guard.
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/MeetingRoom', () => ({ findOne: jest.fn() }));
jest.mock('../models/MeetingOverlay', () => ({ findOne: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));

const MeetingRoom = require('../models/MeetingRoom');
const MeetingOverlay = require('../models/MeetingOverlay');
const User = require('../models/User');
const Company = require('../models/Company');
const meetingSocket = require('../utils/meetingSocket');

let server;
let io;
let port;

// Room fixtures (mocked DB rows).
const meetingDoc = (over = {}) => ({
  _id: 'mA', roomId: 'roomA', host: 'userA', company: 'companyA',
  participants: [{ user: 'userM', status: 'invited' }], status: 'scheduled',
  save: jest.fn(async function () { return this; }),
  ...over,
});
const overlayDoc = (over = {}) => ({
  meetingId: 'mA', status: 'active', hostUserId: 'userA', companyId: 'companyA',
  access: { mode: 'company', invitedUserIds: [] },
  ...over,
});
let meetings = {};
let overlays = {};
// Company mock with REAL membership discrimination (unlike the REST tests):
// only currentMember (or companyA's owner userA) passes.
let currentMember = null;
const isMemberQuery = (q) => {
  if (String(q?._id) !== 'companyA') return false;
  const ors = q?.$or || [];
  return ors.some((c) => String(c.owner) === 'userA' || (c['members.user'] && String(c['members.user']) === currentMember));
};

const connect = (userId) =>
  new Promise((resolve, reject) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    const socket = ioClient(`http://localhost:${port}/meeting`, {
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

// Resolves true if the event arrives within ms, false on timeout.
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
  meetingSocket(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  currentMember = null;
  meetings = { roomA: meetingDoc() };
  overlays = {};
  MeetingRoom.findOne.mockImplementation(async (q) => meetings[q?.roomId] || null);
  MeetingOverlay.findOne.mockImplementation(async (q) =>
    Object.values(overlays).find((o) => String(o.meetingId) === String(q?.meetingId) && (!q?.status || o.status === q.status)) || null
  );
  User.findById.mockImplementation(async () => ({
    select: () => ({ fullName: 'U', email: 'u@x.io', profilePicture: null }),
  }));
  // userC is a companyA member; everyone else is a stranger unless listed.
  Company.findOne.mockImplementation((q) => ({
    select: () => ({ lean: async () => (isMemberQuery(q) ? { _id: 'companyA' } : null) }),
  }));
});

afterEach(() => {
  io.of('/meeting').sockets.forEach((s) => s.disconnect(true));
});

describe('join-room access', () => {
  test('unknown roomId → error, not joined', async () => {
    const s = await connect('userB');
    s.emit('join-room', { roomId: 'nope' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/not found/i);
    s.disconnect();
  });

  test('stranger cannot join (no peer list, no broadcasts)', async () => {
    const s = await connect('userB');
    s.emit('join-room', { roomId: 'roomA' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    // Must not receive the room-users peer list either.
    expect(await received(s, 'room-users')).toBe(false);
    s.disconnect();
  });

  test('host can join', async () => {
    const s = await connect('userA');
    s.emit('join-room', { roomId: 'roomA' });
    const list = await once(s, 'room-users');
    expect(list).toBeDefined();
    s.disconnect();
  });

  test('invited participant can join', async () => {
    const s = await connect('userM');
    s.emit('join-room', { roomId: 'roomA' });
    await once(s, 'room-users');
    s.disconnect();
  });

  test('company member can join', async () => {
    currentMember = 'userC';
    const s = await connect('userC');
    s.emit('join-room', { roomId: 'roomA' });
    await once(s, 'room-users');
    s.disconnect();
  });

  test('overlay public mode lets strangers join', async () => {
    meetings.roomPub = meetingDoc({ _id: 'mPub', roomId: 'roomPub', host: 'userX', company: undefined, participants: [] });
    overlays.pub = overlayDoc({ meetingId: 'mPub', hostUserId: 'userX', access: { mode: 'public', invitedUserIds: [] } });
    const s = await connect('userB');
    s.emit('join-room', { roomId: 'roomPub' });
    await once(s, 'room-users');
    s.disconnect();
  });

  test('overlay invited mode keeps strangers out, admits invitees', async () => {
    meetings.roomInv = meetingDoc({ _id: 'mInv', roomId: 'roomInv', host: 'userX', company: undefined, participants: [] });
    overlays.inv = overlayDoc({ meetingId: 'mInv', hostUserId: 'userX', access: { mode: 'invited', invitedUserIds: ['userV'] } });
    const stranger = await connect('userB');
    stranger.emit('join-room', { roomId: 'roomInv' });
    const err = await once(stranger, 'error');
    expect(err.message).toMatch(/denied/i);
    stranger.disconnect();

    const invitee = await connect('userV');
    invitee.emit('join-room', { roomId: 'roomInv' });
    await once(invitee, 'room-users');
    invitee.disconnect();
  });
});

describe('meeting-ended authorization', () => {
  test('non-host participant cannot end the meeting', async () => {
    const host = await connect('userA');
    host.emit('join-room', { roomId: 'roomA' });
    await once(host, 'room-users');

    // userM is a joined participant but not the host: passes join + packet
    // guard, so this exercises the meeting-ended host check itself.
    const participant = await connect('userM');
    participant.emit('join-room', { roomId: 'roomA' });
    await once(participant, 'room-users');
    meetings.roomA.save.mockClear(); // joins above legitimately save; isolate the end attempt
    participant.emit('meeting-ended', { roomId: 'roomA' });
    const err = await once(participant, 'error');
    expect(err.message).toMatch(/host/i);
    expect(meetings.roomA.save).not.toHaveBeenCalled();
    // Host must not observe an end broadcast.
    expect(await received(host, 'meeting-ended')).toBe(false);
    host.disconnect();
    participant.disconnect();
  });

  test('host can end the meeting', async () => {
    const host = await connect('userA');
    host.emit('join-room', { roomId: 'roomA' });
    await once(host, 'room-users');
    host.emit('meeting-ended', { roomId: 'roomA' });
    await once(host, 'meeting-ended');
    expect(meetings.roomA.save).toHaveBeenCalled();
    expect(meetings.roomA.status).toBe('completed');
    host.disconnect();
  });
});

describe('cross-room spoof guard', () => {
  test('emit into a room you never joined is dropped', async () => {
    const attacker = await connect('userA');
    attacker.emit('join-room', { roomId: 'roomA' });
    await once(attacker, 'room-users');

    attacker.emit('chat-message', { roomId: 'roomB', message: 'spoofed' });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this room/i);
    attacker.disconnect();
  });

  test('in-room chat still flows', async () => {
    const a = await connect('userA');
    a.emit('join-room', { roomId: 'roomA' });
    await once(a, 'room-users');
    const got = once(a, 'chat-message');
    a.emit('chat-message', { roomId: 'roomA', message: 'hi' });
    const msg = await got;
    expect(msg.message).toBe('hi');
    a.disconnect();
  });
});
