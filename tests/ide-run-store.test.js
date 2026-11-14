/**
 * DES-03 — run records must survive on another instance, and live events must
 * relay without duplicating locally.
 */
jest.mock('../utils/redis', () => ({ getRedisClients: jest.fn() }));

const redis = require('../utils/redis');

const stored = new Map();
const subHandlers = {};
let published = [];

const subscriber = {
  on: jest.fn((event, handler) => { subHandlers[event] = handler; }),
  connect: jest.fn(async () => {}),
  subscribe: jest.fn(async () => {}),
};

const client = {
  set: jest.fn(async (key, value) => { stored.set(key, value); return 'OK'; }),
  get: jest.fn(async (key) => (stored.has(key) ? stored.get(key) : null)),
  del: jest.fn(async (key) => { stored.delete(key); return 1; }),
  publish: jest.fn(async (channel, message) => { published.push([channel, message]); return 1; }),
  duplicate: jest.fn(() => subscriber),
};

const store = require('../utils/ideRunStore');

function run(overrides = {}) {
  return {
    id: 'run-1',
    userId: 'user-1',
    language: 'javascript',
    entry: 'main.js',
    backend: 'container',
    status: 'running',
    output: '',
    outputChunks: 0,
    problems: [],
    result: null,
    error: null,
    listeners: new Set(),
    createdAt: Date.now(),
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  stored.clear();
  published = [];
  redis.getRedisClients.mockResolvedValue({ pub: client, sub: subscriber });
});

test('create persists the record with a TTL and get() reads it back on another instance', async () => {
  await store.create(run({ id: 'run-persisted' }));

  expect(client.set).toHaveBeenCalledWith('ide:run:run-persisted', expect.any(String), 'PX', store.RUN_TTL_MS);

  // Simulate a different instance: drop the local cache entry.
  store._runs.delete('run-persisted');
  const loaded = await store.get('run-persisted');

  expect(loaded).toMatchObject({ id: 'run-persisted', status: 'running' });
  expect(loaded.listeners).toBeInstanceOf(Set);
});

test('publishing dispatches once locally and relays for the other instances', async () => {
  const doc = run({ id: 'run-live' });
  await store.create(doc);
  const seen = [];
  await store.subscribe(doc, (event, data) => seen.push([event, data]));

  await store.publish(doc, 'output', { chunk: 'local-chunk' });

  // Local listener fired once; the same instance did not append its own chunk
  // again (the executor owns that append).
  expect(seen).toHaveLength(1);
  expect(doc.output).toBe('');
  expect(published).toHaveLength(1);
  expect(subscriber.subscribe).toHaveBeenCalledWith('ide:runs');

  // A message from another instance is applied locally and delivered.
  subHandlers.message('ide:runs', JSON.stringify({
    runId: 'run-live',
    event: 'output',
    data: { chunk: 'remote-chunk', origin: process.pid + 1 },
  }));

  expect(seen).toHaveLength(2);
  expect(doc.output).toBe('remote-chunk');

  // Our own relayed event must be ignored on the way back.
  subHandlers.message('ide:runs', JSON.stringify({
    runId: 'run-live',
    event: 'output',
    data: { chunk: 'local-chunk', origin: process.pid },
  }));
  expect(seen).toHaveLength(2);
  expect(doc.output).toBe('remote-chunk');
});

test('remove deletes the Redis record as well as the local one', async () => {
  await store.create(run({ id: 'run-remove' }));
  await store.remove('run-remove');

  expect(store._runs.has('run-remove')).toBe(false);
  expect(client.del).toHaveBeenCalledWith('ide:run:run-remove');
});
