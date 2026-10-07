/**
 * Tenant-isolation tests for server/sockets/roomSocket.js (audit rec 7).
 *
 * This namespace already re-verifies roomService.getRole on every packet —
 * these tests LOCK that contract (participant-only join, role-gated terminal
 * publish, no delivery for non-participants) and cover the room:leave
 * presence-spoof guard added in the rec-7 pass.
 *
 * Real socket.io server + real clients on /rooms; roomService mocked with
 * realistic participant logic.
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../server/services/roomService', () => ({
  getRoom: jest.fn(),
  getRole: jest.fn(),
  touchActivity: jest.fn(async () => {}),
}));

const roomService = require('../server/services/roomService');
const roomSocket = require('../server/sockets/roomSocket');

let server;
let io;
let port;
let sockets;

const USER_A = '507f1f77bcf86cd799439011'; // host
const USER_B = '507f1f77bcf86cd799439012'; // viewer participant
const USER_C = '507f1f77bcf86cd799439013'; // stranger

const roomDoc = (over = {}) => ({
  _id: 'r1', roomId: 'ROOM-1', hostId: USER_A, status: 'open',
  participants: [
    { userId: USER_A, role: 'host' },
    { userId: USER_B, role: 'viewer' },
  ],
  terminalSeq: 0,
  save: jest.fn(async function () { return this; }),
  ...over,
});
let rooms = {};

const connect = (userId) =>
  new Promise((resolve, reject) => {
    const token = userId === null
      ? undefined
      : jwt.sign({ userId }, process.env.JWT_SECRET);
    const socket = ioClient(`http://localhost:${port}/rooms`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
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
  roomSocket(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  sockets = [];
  rooms = { 'ROOM-1': roomDoc() };
  roomService.getRoom.mockImplementation(async (id) => rooms[id] || null);
  // Same logic as the real roomService.getRole: participant lookup by userId.
  roomService.getRole.mockImplementation((room, userId) => {
    const p = (room?.participants || []).find((x) => String(x.userId) === String(userId));
    return p ? p.role : null;
  });
});

afterEach(() => {
  sockets.forEach((s) => s.disconnect(true));
});

describe('join authorization', () => {
  test('participant joins with their role', async () => {
    const s = await connect(USER_B);
    s.emit('room:join', { roomId: 'ROOM-1' });
    const joined = await once(s, 'room:joined');
    expect(joined.role).toBe('viewer');
    s.disconnect();
  });

  test('stranger cannot join', async () => {
    const s = await connect(USER_C);
    s.emit('room:join', { roomId: 'ROOM-1' });
    const err = await once(s, 'room:error');
    expect(err.message).toMatch(/participant/i);
    s.disconnect();
  });

  test('closed room → not found or closed', async () => {
    rooms['ROOM-1'].status = 'closed';
    const s = await connect(USER_A);
    s.emit('room:join', { roomId: 'ROOM-1' });
    const err = await once(s, 'room:error');
    expect(err.message).toMatch(/not found or closed/i);
    s.disconnect();
  });

  test('unknown room → not found or closed', async () => {
    const s = await connect(USER_A);
    s.emit('room:join', { roomId: 'NOPE' });
    const err = await once(s, 'room:error');
    expect(err.message).toMatch(/not found or closed/i);
    s.disconnect();
  });
});

describe('role-gated packets (getRole re-verified per event)', () => {
  test('stranger signaling is silently dropped (no delivery to participants)', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');

    const stranger = await connect(USER_C);
    stranger.emit('room:signal', { roomId: 'ROOM-1', data: { sdp: 'offer' } });
    expect(await received(host, 'room:signal')).toBe(false);
    host.disconnect();
    stranger.disconnect();
  });

  test('viewer cannot publish terminal chunks (read-only)', async () => {
    const viewer = await connect(USER_B);
    viewer.emit('room:join', { roomId: 'ROOM-1' });
    await once(viewer, 'room:joined');
    viewer.emit('room:terminal-chunk', { roomId: 'ROOM-1', chunk: 'rm -rf /' });
    const err = await once(viewer, 'room:error');
    expect(err.message).toMatch(/read-only/i);
    expect(rooms['ROOM-1'].save).not.toHaveBeenCalled();
    viewer.disconnect();
  });

  test('host can publish terminal chunks', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');
    const got = once(host, 'room:terminal-chunk');
    host.emit('room:terminal-chunk', { roomId: 'ROOM-1', chunk: 'ls' });
    const payload = await got;
    expect(payload.seq).toBe(1);
    expect(payload.chunk).toBe('ls');
    host.disconnect();
  });

  test('stranger terminal-resync gets nothing back', async () => {
    const stranger = await connect(USER_C);
    stranger.emit('room:terminal-resync', { roomId: 'ROOM-1', fromSeq: 0 });
    expect(await received(stranger, 'room:terminal-resync')).toBe(false);
    stranger.disconnect();
  });
});

describe('room:leave presence guard', () => {
  test('participant leaving announces presence', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');

    // Listen for the LEAVE event specifically: the guest's join also emits a
    // presence (joined: true) that can land after its room:joined ack.
    const left = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for leave presence')), 4000);
      const handler = (p) => {
        if (p.joined === false) {
          clearTimeout(timer);
          host.off('room:presence', handler);
          resolve(p);
        }
      };
      host.on('room:presence', handler);
    });

    const guest = await connect(USER_B);
    guest.emit('room:join', { roomId: 'ROOM-1' });
    await once(guest, 'room:joined');

    guest.emit('room:leave', { roomId: 'ROOM-1' });
    const presence = await left;
    expect(presence.userId).toBe(USER_B);
    expect(presence.joined).toBe(false);
    host.disconnect();
    guest.disconnect();
  });

  test('non-participant cannot inject presence events into a room', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');

    const stranger = await connect(USER_C); // never joined
    stranger.emit('room:leave', { roomId: 'ROOM-1' });
    expect(await received(host, 'room:presence')).toBe(false);
    host.disconnect();
    stranger.disconnect();
  });
});

describe('closed rooms and chunk limits', () => {
  test('signals into a closed room are dropped', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');
    rooms['ROOM-1'].status = 'closed';
    host.emit('room:signal', { roomId: 'ROOM-1', data: { sdp: 'late-offer' } });
    expect(await received(host, 'room:signal')).toBe(false);
    host.disconnect();
  });

  test('terminal chunks into a closed room are dropped (no save)', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');
    rooms['ROOM-1'].status = 'closed';
    host.emit('room:terminal-chunk', { roomId: 'ROOM-1', chunk: 'after close' });
    expect(await received(host, 'room:terminal-chunk')).toBe(false);
    expect(rooms['ROOM-1'].save).not.toHaveBeenCalled();
    host.disconnect();
  });

  test('oversize chunks are rejected with room:error', async () => {
    const host = await connect(USER_A);
    host.emit('room:join', { roomId: 'ROOM-1' });
    await once(host, 'room:joined');
    const err = once(host, 'room:error');
    host.emit('room:terminal-chunk', { roomId: 'ROOM-1', chunk: 'x'.repeat(100 * 1024) });
    expect((await err).message).toMatch(/too large/i);
    expect(rooms['ROOM-1'].save).not.toHaveBeenCalled();
    host.disconnect();
  });
});
