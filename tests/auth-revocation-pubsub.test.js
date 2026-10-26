jest.mock('../utils/redis', () => ({
  publishAuthRevoke: jest.fn(async () => true),
  subscribeAuthRevoke: jest.fn(async (handler) => {
    global.__authRevokeHandler = handler;
    return true;
  }),
}));

const redis = require('../utils/redis');
const {
  invalidateLivenessEverywhere,
  initLivenessRevocationSubscriber,
} = require('../middleware/auth');

beforeEach(() => jest.clearAllMocks());

describe('cross-instance auth revocation', () => {
  test('publishes after clearing the local liveness entry', async () => {
    await expect(invalidateLivenessEverywhere('user-1')).resolves.toBe(true);
    expect(redis.publishAuthRevoke).toHaveBeenCalledWith('user-1');
  });

  test('subscribes once and clears liveness when another instance revokes', async () => {
    await expect(initLivenessRevocationSubscriber()).resolves.toBe(true);
    expect(redis.subscribeAuthRevoke).toHaveBeenCalledTimes(1);
    expect(typeof global.__authRevokeHandler).toBe('function');
    expect(() => global.__authRevokeHandler('user-2')).not.toThrow();
  });

  test('stays local-only when Redis is unavailable', async () => {
    redis.publishAuthRevoke.mockResolvedValueOnce(false);
    await expect(invalidateLivenessEverywhere('user-3')).resolves.toBe(false);
  });
});
