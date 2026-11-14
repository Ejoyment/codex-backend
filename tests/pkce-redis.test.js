/**
 * DES-01 — with Redis configured the PKCE verifier is shared between
 * instances and consumed atomically, so the callback works on any node.
 */
jest.mock('../utils/redis', () => ({ getRedisClients: jest.fn() }));

const redis = require('../utils/redis');
const pkceStore = require('../utils/pkceStore');

const client = { set: jest.fn(), eval: jest.fn(), del: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  pkceStore.clear();
  redis.getRedisClients.mockResolvedValue({ pub: client });
  client.set.mockResolvedValue('OK');
  client.del.mockResolvedValue(1);
});

test('writes the verifier to Redis with the PKCE TTL', async () => {
  await pkceStore.set('user-1', 'verifier-1');

  expect(client.set).toHaveBeenCalledWith(
    'figma:pkce:user-1',
    'verifier-1',
    'PX',
    expect.any(Number)
  );
});

test('reads through an atomic get-and-delete', async () => {
  client.eval.mockResolvedValue('verifier-1');

  await expect(pkceStore.get('user-1')).resolves.toBe('verifier-1');
  expect(client.eval).toHaveBeenCalledWith(
    expect.stringContaining("redis.call('GET'"),
    1,
    'figma:pkce:user-1'
  );
});

test('does not replay a verifier another instance already consumed', async () => {
  await pkceStore.set('user-1', 'verifier-1');
  client.eval.mockResolvedValue(null); // already redeemed elsewhere

  await expect(pkceStore.get('user-1')).resolves.toBeNull();
  expect(pkceStore.size()).toBe(0);
});

test('falls back to the memory copy when Redis errors', async () => {
  await pkceStore.set('user-1', 'verifier-1');
  client.eval.mockRejectedValue(new Error('connection lost'));

  await expect(pkceStore.get('user-1')).resolves.toBe('verifier-1');
});

test('delete clears both copies', async () => {
  await pkceStore.set('user-1', 'verifier-1');

  await pkceStore.delete('user-1');

  expect(client.del).toHaveBeenCalledWith('figma:pkce:user-1');
  expect(pkceStore.size()).toBe(0);
});
