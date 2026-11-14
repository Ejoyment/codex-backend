/**
 * DES-03 — room terminal buffers must be readable from any instance.
 */
jest.mock('../utils/redis', () => ({ getRedisClients: jest.fn() }));

const redis = require('../utils/redis');

const lists = new Map();
const counters = new Map();

const multi = {
  rpush: jest.fn(function (key, value) { const list = lists.get(key) || []; list.push(value); lists.set(key, list); return this; }),
  ltrim: jest.fn(function (key, start, stop) {
    const list = lists.get(key) || [];
    const from = Number(start) < 0 ? Math.max(0, list.length + Number(start)) : Number(start);
    lists.set(key, list.slice(from, Number(stop) + 1));
    return this;
  }),
  pexpire: jest.fn(function () { return this; }),
  exec: jest.fn(async () => []),
};

const client = {
  incr: jest.fn(async (key) => { const next = (counters.get(key) || 0) + 1; counters.set(key, next); return next; }),
  get: jest.fn(async (key) => (counters.has(key) ? String(counters.get(key)) : null)),
  lrange: jest.fn(async (key) => lists.get(key) || []),
  del: jest.fn(async (key) => { lists.delete(key); counters.delete(key); return 1; }),
  multi: jest.fn(() => multi),
};

const roomSocket = require('../server/sockets/roomSocket');

function fakeIO() {
  const ns = {
    use: jest.fn(),
    on: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
  return { of: jest.fn(() => ns) };
}

beforeEach(() => {
  jest.clearAllMocks();
  lists.clear();
  counters.clear();
  redis.getRedisClients.mockResolvedValue({ pub: client });
});

test('pushChunk increments the shared sequence and stores the chunk with a TTL', async () => {
  const api = roomSocket(fakeIO());
  const first = await api.pushChunk('room-redis', 'a');
  const second = await api.pushChunk('room-redis', 'b');

  expect(first.seq).toBe(1);
  expect(second.seq).toBe(2);
  expect(client.incr).toHaveBeenCalledWith('room:termseq:room-redis');
  expect(multi.rpush).toHaveBeenCalledWith('room:term:room-redis', JSON.stringify(second));
  expect(multi.ltrim).toHaveBeenCalledWith('room:term:room-redis', -500, -1);
  expect(multi.pexpire).toHaveBeenCalledWith('room:term:room-redis', 30 * 60 * 1000);
});

test('chunksFrom replays what another instance stored', async () => {
  const api = roomSocket(fakeIO());
  lists.set('room:term:room-redis', [
    JSON.stringify({ seq: 4, chunk: 'four', ts: 1 }),
    JSON.stringify({ seq: 5, chunk: 'five', ts: 2 }),
  ]);
  counters.set('room:termseq:room-redis', 5);

  const missed = await api.chunksFrom('room-redis', 4);

  expect(missed.seq).toBe(5);
  expect(missed.chunks.map((c) => c.chunk)).toEqual(['five']);
});

test('clearBuffer removes both shared keys', async () => {
  const api = roomSocket(fakeIO());
  await api.clearBuffer('room-redis');

  expect(client.del).toHaveBeenCalledWith('room:term:room-redis', 'room:termseq:room-redis');
});

test('a Redis error falls back to the local ring instead of dropping output', async () => {
  redis.getRedisClients.mockResolvedValue({ pub: { ...client, incr: jest.fn(async () => { throw new Error('down'); }) } });
  const api = roomSocket(fakeIO());

  const entry = await api.pushChunk('room-fallback', 'still here');
  const replay = await api.chunksFrom('room-fallback', 0);

  expect(entry.seq).toBe(1);
  expect(replay.chunks.map((c) => c.chunk)).toEqual(['still here']);
});
