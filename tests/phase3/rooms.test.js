/**
 * Phase 3 tests — Ephemeral Debug Rooms.
 * Covers: secret redaction/allowlist, snapshot builder caps, role rules,
 * terminal resync buffer, TTL/idle cleanup (mocked model).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.example') });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-chars!!';

const roomService = require('../../server/services/roomService');

describe('roomService — secret handling', () => {
  test('SECRET_NAME_RE matches *_KEY, *_SECRET, *_TOKEN, *_PASSWORD', () => {
    expect(roomService.SECRET_NAME_RE.test('STRIPE_API_KEY')).toBe(true);
    expect(roomService.SECRET_NAME_RE.test('MY_SECRET')).toBe(true);
    expect(roomService.SECRET_NAME_RE.test('AUTH_TOKEN')).toBe(true);
    expect(roomService.SECRET_NAME_RE.test('DB_PASSWORD')).toBe(true);
    expect(roomService.SECRET_NAME_RE.test('NODE_ENV')).toBe(false);
  });

  test('redactEnvValue redacts secrets, passes through safe keys', () => {
    expect(roomService.redactEnvValue('API_KEY', 'sk-live')).toBe('[REDACTED]');
    expect(roomService.redactEnvValue('NODE_ENV', 'production')).toBe('production');
  });

  test('filterEnv shares only explicitly listed keys, one at a time', () => {
    const env = { NODE_ENV: 'production', PORT: '3000', STRIPE_API_KEY: 'sk-live', HOME: '/root' };
    // Nothing shared by default — no inherited environment.
    expect(roomService.filterEnv(env, [])).toEqual({});
    // Explicit single-variable share works for allowlisted key.
    expect(roomService.filterEnv(env, ['NODE_ENV'])).toEqual({ NODE_ENV: 'production' });
    // Secret values never leave the host even when requested.
    expect(roomService.filterEnv(env, ['STRIPE_API_KEY'])).toEqual({ STRIPE_API_KEY: '[REDACTED]' });
    // Non-shared keys are absent.
    const out = roomService.filterEnv(env, ['PORT']);
    expect(out.HOME).toBeUndefined();
    expect(out.STRIPE_API_KEY).toBeUndefined();
  });
});

describe('roomService — buildSnapshot', () => {
  test('builds snapshot with capped terminal/diff and redacted env', () => {
    const snap = roomService.buildSnapshot({
      terminalBuffer: 'x'.repeat(50000),
      stackTrace: 'Error: boom\n    at a\n    at b',
      openFiles: [{ path: 'src/index.js', cursor: { line: 1, ch: 2 } }],
      gitBranch: 'main',
      gitDiff: 'y'.repeat(50000),
      env: { NODE_ENV: 'production', API_KEY: 'secret' },
      sharedEnvKeys: ['NODE_ENV'],
    });
    expect(snap.terminalBuffer.length).toBeLessThanOrEqual(20000);
    expect(snap.git.diff.length).toBeLessThanOrEqual(20000);
    expect(snap.openFiles).toEqual([{ path: 'src/index.js', cursor: { line: 1, ch: 2 } }]);
    expect(snap.env).toEqual({ NODE_ENV: 'production' });
    expect(snap.snapshotId).toMatch(/^snap_/);
  });

  test('caps stack trace to 50 lines and files to 50 entries', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `at fn${i}`);
    const snap = roomService.buildSnapshot({
      stackTrace: lines,
      openFiles: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}.js` })),
    });
    expect(snap.stackTrace.length).toBe(50);
    expect(snap.openFiles.length).toBe(50);
  });
});

describe('roomService — roles & control', () => {
  function fakeRoom() {
    return {
      hostId: { toString: () => 'host1' },
      participants: [
        { userId: { toString: () => 'host1' }, role: 'host' },
        { userId: { toString: () => 'guest1' }, role: 'viewer' },
      ],
      pendingRequests: [],
      lastActivityAt: new Date(),
      save: jest.fn().mockResolvedValue(true),
    };
  }

  test('isHost identifies host; getRole returns viewer by default', () => {
    const room = fakeRoom();
    expect(roomService.isHost(room, 'host1')).toBe(true);
    expect(roomService.isHost(room, 'guest1')).toBe(false);
    expect(roomService.getRole(room, 'guest1')).toBe('viewer');
    expect(roomService.getRole(room, 'stranger')).toBeNull();
  });

  test('setControl grants and instantly revokes controller rights', async () => {
    const room = fakeRoom();
    await roomService.setControl(room, 'guest1', true);
    expect(room.participants.find((p) => p.userId.toString() === 'guest1').role).toBe('controller');
    await roomService.setControl(room, 'guest1', false);
    expect(room.participants.find((p) => p.userId.toString() === 'guest1').role).toBe('viewer');
  });

  test('setControl refuses to change host role and unknown participants', async () => {
    const room = fakeRoom();
    await expect(roomService.setControl(room, 'host1', false)).rejects.toThrow();
    await expect(roomService.setControl(room, 'ghost', true)).rejects.toThrow('Participant not found');
  });

  test('respondToJoin approves as viewer (read-only by default)', async () => {
    const room = fakeRoom();
    room.pendingRequests = [{ userId: { toString: () => 'new1' } }];
    room.status = 'pending';
    await roomService.respondToJoin(room, 'new1', true);
    const p = room.participants.find((x) => x.userId.toString() === 'new1');
    expect(p.role).toBe('viewer');
    expect(room.status).toBe('active');
  });
});

describe('routes — rooms & billing mount with expected endpoints', () => {
  function routePaths(router) {
    const paths = [];
    for (const layer of router.stack || []) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        paths.push(`${methods} ${layer.route.path}`);
      }
    }
    return paths;
  }

  test('rooms router exposes create/respond/control/share/get/delete', () => {
    const router = require('../../server/routes/rooms');
    const paths = routePaths(router).join('\n');
    expect(paths).toMatch('POST /');
    expect(paths).toMatch('/:id/respond');
    expect(paths).toMatch('/:id/control');
    expect(paths).toMatch('/:id/share-env');
    expect(paths).toMatch('GET /:id');
    expect(paths).toMatch('DELETE /:id');
  });

  test('billing router exposes checkout/webhook/entitlement/cancel', () => {
    const router = require('../../server/routes/billing');
    const paths = routePaths(router).join('\n');
    expect(paths).toMatch('/checkout');
    expect(paths).toMatch('/webhook/:provider');
    expect(paths).toMatch('/entitlement');
    expect(paths).toMatch('/cancel');
  });
});

describe('roomSocket — sequenced terminal relay', () => {
  let api;
  const fakeIO = () => {
    const handlers = {};
    const emitted = [];
    const ns = {
      use: jest.fn(),
      on: jest.fn((evt, cb) => { handlers[evt] = cb; }),
      to: jest.fn(() => ({ emit: jest.fn((e, p) => emitted.push([e, p])) })),
      emitted,
      handlers,
    };
    return { of: jest.fn(() => ns), ns };
  };

  test('pushChunk sequences output; chunksFrom resyncs from seq number', () => {
    const io = fakeIO();
    api = require('../../server/sockets/roomSocket')(io);
    const a = api.pushChunk('room1', 'hello ');
    const b = api.pushChunk('room1', 'world');
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    // Fresh guest resyncs everything from 0.
    const full = api.chunksFrom('room1', 0);
    expect(full.chunks.map((c) => c.chunk).join('')).toBe('hello world');
    // Reconnecting guest resyncs only what it missed.
    const missed = api.chunksFrom('room1', 1);
    expect(missed.chunks.length).toBe(1);
    expect(missed.chunks[0].chunk).toBe('world');
    api.clearBuffer('room1');
    expect(api.chunksFrom('room1', 0).chunks).toEqual([]);
  });
});

describe('roomService — TTL/idle cleanup wipes snapshot data', () => {
  test('cleanupExpiredRooms deletes expired + idle rooms', async () => {
    const DebugRoom = require('../../server/models/DebugRoomModel');
    const spy = jest.spyOn(DebugRoom, 'deleteMany').mockResolvedValue({ deletedCount: 2 });
    const res = await roomService.cleanupExpiredRooms({ now: new Date() });
    expect(res.deleted).toBe(2);
    expect(spy).toHaveBeenCalled();
    const filter = spy.mock.calls[0][0];
    expect(JSON.stringify(filter)).toMatch('expiresAt');
    expect(JSON.stringify(filter)).toMatch('lastActivityAt');
    spy.mockRestore();
  });

  test('closeRoom hard-deletes so nothing persists', async () => {
    const DebugRoom = require('../../server/models/DebugRoomModel');
    const spy = jest.spyOn(DebugRoom, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    const room = { _id: 'abc', status: 'active', snapshotRef: 'snap_x', sharedEnvKeys: ['NODE_ENV'], pendingRequests: [1], participants: [1] };
    const res = await roomService.closeRoom(room);
    expect(res.closed).toBe(true);
    expect(room.snapshotRef).toBeNull();
    expect(room.participants).toEqual([]);
    expect(spy).toHaveBeenCalledWith({ _id: 'abc' });
    spy.mockRestore();
  });
});
