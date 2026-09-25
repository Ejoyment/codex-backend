/**
 * Unit tests for Debug Rooms (Phase 3).
 * Redaction is pure-logic. Service-layer lifecycle is tested against a
 * mocked DebugRoom model, matching the mocking style used in billing.test.js
 * — no live MongoDB connection needed.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });
process.env.NODE_ENV = 'test';

describe('sanitize.redactEnvVars', () => {
  const { redactEnvVars, isSecretEnvName } = require('../utils/sanitize');

  test('redacts names matching secret patterns', () => {
    const input = {
      STRIPE_SECRET_KEY: 'sk_live_abc',
      DB_PASSWORD: 'hunter2',
      AUTH_TOKEN: 'tok_123',
      SECRET_ANYTHING: 'x'
    };
    const result = redactEnvVars(input);
    expect(result.STRIPE_SECRET_KEY).toBe('[REDACTED]');
    expect(result.DB_PASSWORD).toBe('[REDACTED]');
    expect(result.AUTH_TOKEN).toBe('[REDACTED]');
    expect(result.SECRET_ANYTHING).toBe('[REDACTED]');
  });

  test('passes through names that do not match a secret pattern', () => {
    const result = redactEnvVars({ NODE_ENV: 'production', PORT: '3000' });
    expect(result.NODE_ENV).toBe('production');
    expect(result.PORT).toBe('3000');
  });

  test('explicitAllow lets one secret-shaped variable through in full', () => {
    const result = redactEnvVars(
      { API_KEY: 'real-value', OTHER_SECRET: 'still-hidden' },
      ['API_KEY']
    );
    expect(result.API_KEY).toBe('real-value');
    expect(result.OTHER_SECRET).toBe('[REDACTED]');
  });

  test('isSecretEnvName matches suffix patterns case-insensitively', () => {
    expect(isSecretEnvName('my_api_key')).toBe(true);
    expect(isSecretEnvName('MY_TOKEN')).toBe(true);
    expect(isSecretEnvName('WORKSPACE_ID')).toBe(false);
  });
});

describe('DebugRoomService - lifecycle (DebugRoom model mocked)', () => {
  let DebugRoom;
  let debugRoomService;

  const hostId = 'host-1';
  const guestId = 'guest-1';
  const companyId = 'company-1';

  function makeRoomDoc(overrides = {}) {
    const doc = {
      _id: 'room-1',
      host: hostId,
      status: 'pending',
      participants: [{ user: guestId, role: 'viewer', joinedAt: new Date() }],
      snapshotRef: 'temp-ref',
      expiresAt: new Date(Date.now() + 60000),
      save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
      ...overrides
    };
    return doc;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../models/DebugRoom', () => ({
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      updateOne: jest.fn().mockResolvedValue({})
    }));
    // debugRoomService writes audit entries via TeamActivity on every
    // lifecycle transition — mocked so tests never need a live DB.
    jest.doMock('../models/TeamActivity', () => ({
      create: jest.fn().mockResolvedValue({})
    }));
    process.env.NODE_ENV = 'test'; // keeps the idle-sweep interval from starting
    DebugRoom = require('../models/DebugRoom');
    debugRoomService = require('../utils/debugRoomService');
  });

  afterAll(() => {
    debugRoomService.stopIdleSweep();
  });

  test('createRoom requires hostId, guestId and companyId', async () => {
    await expect(
      debugRoomService.createRoom({ hostId, guestId })
    ).rejects.toThrow(/required/);
  });

  test('createRoom creates a pending room with the guest as viewer', async () => {
    DebugRoom.create.mockResolvedValue(makeRoomDoc());
    const room = await debugRoomService.createRoom({ hostId, guestId, companyId });
    expect(DebugRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({ host: hostId, company: companyId, status: 'pending' })
    );
    expect(room.status).toBe('pending');
  });

  test('respondToRoom rejects a non-host', async () => {
    DebugRoom.findById.mockResolvedValue(makeRoomDoc());
    await expect(
      debugRoomService.respondToRoom({ roomId: 'room-1', hostId: 'someone-else', decision: 'approve' })
    ).rejects.toThrow(/Only the host/);
  });

  test('respondToRoom approve activates the room and adds the host as a participant', async () => {
    const doc = makeRoomDoc();
    DebugRoom.findById.mockResolvedValue(doc);
    const room = await debugRoomService.respondToRoom({ roomId: 'room-1', hostId, decision: 'approve' });
    expect(room.status).toBe('active');
    expect(room.participants.some((p) => p.user === hostId && p.role === 'host')).toBe(true);
  });

  test('respondToRoom deny closes the room immediately', async () => {
    const doc = makeRoomDoc();
    DebugRoom.findById.mockResolvedValue(doc);
    const room = await debugRoomService.respondToRoom({ roomId: 'room-1', hostId, decision: 'deny' });
    expect(room.status).toBe('closed');
  });

  test('updateControl: only the host may grant control', async () => {
    const doc = makeRoomDoc({ status: 'active' });
    DebugRoom.findById.mockResolvedValue(doc);
    await expect(
      debugRoomService.updateControl({ roomId: 'room-1', actingUserId: guestId, targetUserId: guestId, action: 'grant' })
    ).rejects.toThrow(/Only the host/);
  });

  test('updateControl: host granting control updates the target participant role', async () => {
    const doc = makeRoomDoc({ status: 'active' });
    DebugRoom.findById.mockResolvedValue(doc);
    const room = await debugRoomService.updateControl({
      roomId: 'room-1',
      actingUserId: hostId,
      targetUserId: guestId,
      action: 'grant'
    });
    expect(room.participants.find((p) => p.user === guestId).role).toBe('controller');
  });

  test('closeRoom wipes the snapshot pointer (Ephemeral Guarantee)', async () => {
    const doc = makeRoomDoc({ status: 'active' });
    DebugRoom.findById.mockResolvedValue(doc);
    const room = await debugRoomService.closeRoom({ roomId: 'room-1', actingUserId: hostId });
    expect(room.status).toBe('closed');
    expect(room.snapshotRef).toBeNull();
  });
});