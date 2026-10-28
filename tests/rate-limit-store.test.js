jest.mock('ioredis', () => class FakeRedis {
    on() {}
    call() {}
    disconnect() {}
    quit() {}
});

jest.mock('rate-limit-redis', () => class FakeRedisStore {
    constructor(options) {
        this.options = options;
        this.prefix = options.prefix;
        this.loadedScriptSha1 = Promise.resolve();
    }
});

describe('getRateLimitStore', () => {
    const originalRedisUrl = process.env.REDIS_URL;

    beforeEach(() => {
        jest.resetModules();
        process.env.REDIS_URL = 'redis://fake:6379';
    });

    afterEach(() => {
        const redis = require('../utils/redis');
        redis.resetRedisCache();
        if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
        else process.env.REDIS_URL = originalRedisUrl;
    });

    test('creates a separate store per limiter with a stable prefix', () => {
        const redis = require('../utils/redis');
        const authA = redis.getRateLimitStore('auth');
        const authB = redis.getRateLimitStore('auth');
        const global = redis.getRateLimitStore('global');

        expect(authA).not.toBe(authB);
        expect(authA).not.toBe(global);
        expect(authA.prefix).toBe('rl:auth:');
        expect(global.prefix).toBe('rl:global:');
        expect(typeof authA.options.sendCommand).toBe('function');
    });
});
