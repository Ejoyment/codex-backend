/**
 * Tenant-isolation tests for utils/messagingSocket.js (audit rec 7).
 *
 * Real socket.io server + real client sockets on the /messaging namespace;
 * only the database is stubbed. Proves: channel joins are authorized by
 * channel type + company membership, cross-channel spoof broadcasts are
 * dropped, posting follows channelPolicy (announcement admins-only), and
 * sender identity comes from the DB (no client impersonation).
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/Message', () => ({}));
jest.mock('../models/Channel', () => ({ findById: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));

const Channel = require('../models/Channel');
const User = require('../models/User');
const Company = require('../models/Company');
const messagingSocket = require('../utils/messagingSocket');

let server;
let io;
let port;

const channelDoc = (over = {}) => ({
  _id: 'chanPub', company: 'companyA', type: 'public', archived: false,
  members: [{ user: 'userM', role: 'member' }],
  ...over,
});
let channels = {};
// Discriminating membership mock: only currentMember (or companyA owner userA).
let currentMember = null;
const isMemberQuery = (q) => {
  if (String(q?._id) !== 'companyA') return false;
  const ors = q?.$or || [];
  return ors.some((c) => String(c.owner) === 'userA' || (c['members.user'] && String(c['members.user']) === currentMember));
};

const connect = (userId) =>
  new Promise((resolve, reject) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    const socket = ioClient(`http://localhost:${port}/messaging`, {
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
  messagingSocket(io);
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
  channels = {
    chanPub: channelDoc(),
    chanPriv: channelDoc({ _id: 'chanPriv', type: 'private' }),
    chanAnn: channelDoc({
      _id: 'chanAnn', type: 'announcement',
      members: [{ user: 'userA', role: 'admin' }, { user: 'userM', role: 'member' }],
    }),
  };
  Channel.findById.mockImplementation((id) => ({
    select: () => Promise.resolve(channels[String(id)] || null),
  }));
  User.findById.mockImplementation(() => ({
    select: () => ({ fullName: 'Real Name', profilePicture: null }),
  }));
  Company.findOne.mockImplementation((q) => ({
    select: () => ({ lean: async () => (isMemberQuery(q) ? { _id: 'companyA' } : null) }),
  }));
});

afterEach(() => {
  io.of('/messaging').sockets.forEach((s) => s.disconnect(true));
});

describe('join-channel access', () => {
  test('non-company stranger cannot join a public channel', async () => {
    const s = await connect('userB');
    s.emit('join-channel', { channelId: 'chanPub' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('company member can join a public channel they are not in', async () => {
    currentMember = 'userB';
    const s = await connect('userB');
    s.emit('join-channel', { channelId: 'chanPub' });
    const joined = await once(s, 'channel:joined');
    expect(joined.channelId).toBe('chanPub');
    s.disconnect();
  });

  test('company member WITHOUT channel membership cannot join a private channel', async () => {
    currentMember = 'userB';
    const s = await connect('userB');
    s.emit('join-channel', { channelId: 'chanPriv' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('non-company stranger cannot join a private channel', async () => {
    const s = await connect('userB');
    s.emit('join-channel', { channelId: 'chanPriv' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('channel member can join their private channel', async () => {
    const s = await connect('userM');
    s.emit('join-channel', { channelId: 'chanPriv' });
    await once(s, 'channel:joined');
    s.disconnect();
  });

  test('unknown channel → Channel not found', async () => {
    const s = await connect('userA');
    s.emit('join-channel', { channelId: 'nope' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/not found/i);
    s.disconnect();
  });
});

describe('cross-channel spoof guard', () => {
  test('chat-message without joining is dropped, not delivered', async () => {
    const member = await connect('userM');
    member.emit('join-channel', { channelId: 'chanPub' });
    await once(member, 'channel:joined');

    const attacker = await connect('userB');
    attacker.emit('chat-message', { channelId: 'chanPub', message: 'spoofed' });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this channel/i);
    expect(await received(member, 'chat-message')).toBe(false);
    member.disconnect();
    attacker.disconnect();
  });

  test('typing without joining is dropped', async () => {
    const member = await connect('userM');
    member.emit('join-channel', { channelId: 'chanPub' });
    await once(member, 'channel:joined');

    const attacker = await connect('userB');
    attacker.emit('typing', { channelId: 'chanPub', userName: 'Admin' });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this channel/i);
    expect(await received(member, 'typing')).toBe(false);
    member.disconnect();
    attacker.disconnect();
  });
});

describe('chat-message posting policy', () => {
  test('channel member message is delivered with DB sender identity (client name ignored)', async () => {
    const reader = await connect('userA'); // company owner → public read
    reader.emit('join-channel', { channelId: 'chanPub' });
    await once(reader, 'channel:joined');
    const writer = await connect('userM'); // channel member → can post
    writer.emit('join-channel', { channelId: 'chanPub' });
    await once(writer, 'channel:joined');

    const got = once(reader, 'chat-message');
    writer.emit('chat-message', {
      channelId: 'chanPub',
      message: 'hello',
      userName: 'Spoofed Admin',
      avatar: 'evil.png',
    });
    const msg = await got;
    expect(msg.content).toBe('hello');
    expect(msg.sender.fullName).toBe('Real Name'); // from DB, not payload
    expect(msg.sender.profilePicture).toBeNull();
    reader.disconnect();
    writer.disconnect();
  });

  test('joined public non-member cannot post (channel membership required)', async () => {
    currentMember = 'userB';
    const s = await connect('userB');
    s.emit('join-channel', { channelId: 'chanPub' });
    await once(s, 'channel:joined');
    s.emit('chat-message', { channelId: 'chanPub', message: 'hi' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/not a channel member/i);
    s.disconnect();
  });

  test('non-admin member cannot post in an announcement channel', async () => {
    const s = await connect('userM'); // role: member
    s.emit('join-channel', { channelId: 'chanAnn' });
    await once(s, 'channel:joined');
    s.emit('chat-message', { channelId: 'chanAnn', message: 'hi' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/admins/i);
    s.disconnect();
  });
});
