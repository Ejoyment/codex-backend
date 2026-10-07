/**
 * Server-side rooms hardening (sweep-3 leftovers, non-billing).
 *
 * - roomService.getRoom: malformed IDs return null (404 downstream) instead
 *   of throwing CastError 500s with internal messages.
 * - rooms.js routes surface 404 for malformed IDs without touching the DB.
 * - scripts/lib/tierTools: --yes parsing; writes abort without confirmation
 *   on non-TTY stdin (fail safe); dry-run never writes.
 *
 * No database: models stubbed, stdin is non-TTY under jest.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { _id: '507f1f77bcf86cd799439011' };
    next();
  },
}));

const roomService = require('../server/services/roomService');
const DebugRoom = require('../server/models/DebugRoomModel');
const roomsRouter = require('../server/routes/rooms');

const app = express();
app.use(express.json());
app.use('/api/v1/rooms', roomsRouter);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('roomService.getRoom', () => {
  test('malformed IDs return null without hitting the DB', async () => {
    const spy = jest.spyOn(DebugRoom, 'findById');
    for (const bad of ['nope', '123', '', null, undefined, 'ROOM-1', '507f1f77bcf86cd79943901Z']) {
      expect(await roomService.getRoom(bad)).toBe(null);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('well-formed IDs reach the model', async () => {
    const spy = jest.spyOn(DebugRoom, 'findById').mockResolvedValue(null);
    await roomService.getRoom('507f1f77bcf86cd799439011');
    expect(spy).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });
});

describe('rooms.js malformed IDs', () => {
  test('GET /:id → 404, not 500', async () => {
    const res = await request(app).get('/api/v1/rooms/not-an-id');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  test('POST /:id/respond → 404, not 500', async () => {
    const res = await request(app).post('/api/v1/rooms/not-valid!!/respond').send({ userId: 'u', approve: true });
    expect(res.status).toBe(404);
  });

  test('DELETE /:id → 404, not 500', async () => {
    const res = await request(app).delete('/api/v1/rooms/!!!');
    expect(res.status).toBe(404);
  });
});

describe('tierTools write confirmation', () => {
  const { parseArgs, applyTier } = require('../scripts/lib/tierTools');

  test('parseArgs understands --yes/-y', () => {
    expect(parseArgs(['--yes']).yes).toBe(true);
    expect(parseArgs(['-y']).yes).toBe(true);
    expect(parseArgs(['--dry-run']).yes).toBeFalsy();
  });

  const userDoc = () => ({ _id: new mongoose.Types.ObjectId(), email: 'op@example.com' });
  const subDoc = () => {
    const Subscription = require('../models/Subscription');
    const doc = new Subscription({ userId: new mongoose.Types.ObjectId(), tier: 'developer', status: 'active' });
    doc.save = jest.fn(async function () { return this; });
    return doc;
  };

  test('dry-run never writes', async () => {
    const sub = subDoc();
    const res = await applyTier({
      user: userDoc(), subscription: sub, tier: 'pro', direction: 'upgrade', dryRun: true, force: false,
    });
    expect(res.dryRun).toBe(true);
    expect(sub.save).not.toHaveBeenCalled();
  });

  test('non-TTY write without --yes aborts before saving', async () => {
    const sub = subDoc();
    const res = await applyTier({
      user: userDoc(), subscription: sub, tier: 'pro', direction: 'upgrade',
      dryRun: false, force: true, yes: false,
    });
    expect(res.aborted).toBe(true);
    expect(res.changed).toBe(false);
    expect(sub.save).not.toHaveBeenCalled();
  });
});
