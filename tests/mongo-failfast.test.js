/**
 * MongoDB fail-fast options (audit 2026-10-19, finding #6).
 *
 * Before this, a MongoDB outage made every request buffer in mongoose for the
 * 10s default bufferTimeoutMS (with serverSelectionTimeoutMS 30s on top for
 * boot and selection) — thousands of held requests, sockets and memory, then
 * a synchronized failure wave.
 *
 * These tests pin the options and prove the behavior against an unreachable
 * address: a query must reject quickly instead of buffering.
 */
const mongoose = require('mongoose');
const mongooseOptions = require('../config/mongoOptions');

describe('mongo fail-fast options', () => {
    test('buffering is disabled and selection is bounded', () => {
        expect(mongooseOptions.bufferCommands).toBe(false);
        expect(mongooseOptions.serverSelectionTimeoutMS).toBeLessThanOrEqual(10000);
        expect(mongooseOptions.socketTimeoutMS).toBeGreaterThan(0);
    });
});

describe('unreachable MongoDB', () => {
    let conn;

    afterAll(async () => {
        if (conn) await conn.destroy();
    });

    test('a query rejects fast instead of buffering, while the driver keeps retrying', async () => {
        // 192.0.2.0/24 (TEST-NET-1) is guaranteed unroutable.
        conn = mongoose.createConnection('mongodb://192.0.2.1:27017/failfast-test', {
            ...mongooseOptions,
            serverSelectionTimeoutMS: 200,
        });
        conn.on('error', () => {}); // expected; keep the process quiet

        const Model = conn.model('FailFastProbe', new mongoose.Schema({ x: Number }));

        const outcome = await Promise.race([
            Model.find({}).then(
                () => 'resolved',
                (error) => error
            ),
            new Promise((resolve) => setTimeout(() => resolve('still-buffering'), 3000)),
        ]);

        // Must be an immediate rejection — not a buffered hang (10s default).
        expect(outcome).not.toBe('still-buffering');
        expect(outcome).not.toBe('resolved');
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toMatch(/before initial connection|buffering|connection/i);
    }, 15000);
});
