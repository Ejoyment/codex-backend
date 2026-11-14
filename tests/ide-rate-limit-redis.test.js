/**
 * DES-02 — the IDE run gate must count across instances, not per process.
 */
jest.mock('../utils/redis', () => ({ getRedisClients: jest.fn() }));

const redis = require('../utils/redis');
const { rateGate } = require('../utils/ideRunner');

const client = { eval: jest.fn() };

let counters;
let currentMinute;

beforeEach(() => {
  jest.clearAllMocks();
  counters = new Map();
  currentMinute = Math.floor(Date.now() / 60000);
  redis.getRedisClients.mockResolvedValue({ pub: client });

  client.eval.mockImplementation(async (script, _keys, keyFill) => {
    // Two scripts are used: INCR-with-TTL and DECR-floor-zero.
    const key = keyFill;
    const value = counters.get(key) || 0;
    if (/DECR/.test(script)) {
      const next = Math.max(0, value - 1);
      counters.set(key, next);
      return next;
    }
    const next = value + 1;
    counters.set(key, next);
    return next;
  });
});

test('counts concurrent runs in Redis across instances', async () => {
  const gates = [];
  for (let i = 0; i < 3; i += 1) {
    const gate = await rateGate('shared-user');
    expect(gate.allowed).toBe(true);
    gates.push(gate);
  }

  const rejected = await rateGate('shared-user');
  expect(rejected.allowed).toBe(false);
  expect(rejected.reason).toMatch(/concurrent/i);
  expect(counters.get('ide:active:shared-user')).toBe(3);

  gates[0].release();
  await new Promise(setImmediate);
  expect((await rateGate('shared-user')).allowed).toBe(true);
});

test('shares the per-minute allowance through one bucket per minute', async () => {
  for (let i = 0; i < 20; i += 1) {
    const gate = await rateGate('rate-user');
    expect(gate.allowed).toBe(true);
    gate.release();
  }

  const rejected = await rateGate('rate-user');
  expect(rejected.allowed).toBe(false);
  expect(rejected.reason).toMatch(/20\/min/);
  expect(counters.get(`ide:rate:rate-user:${currentMinute}`)).toBe(20);
});

test('falls back to the in-process gate when Redis errors', async () => {
  client.eval.mockRejectedValue(new Error('connection lost'));

  const gate = await rateGate('fallback-user');
  expect(gate.allowed).toBe(true);
  gate.release();
});
