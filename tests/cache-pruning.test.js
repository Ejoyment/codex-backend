process.env.FIGMA_PKCE_TTL_MS = '50';
process.env.FIGMA_PKCE_MAX_ENTRIES = '2';
process.env.FIGMA_PKCE_SWEEP_MS = '600000';
process.env.AUTH_LIVENESS_TTL_MS = '50';
process.env.AUTH_LIVENESS_MAX_ENTRIES = '2';
process.env.AUTH_LIVENESS_SWEEP_MS = '600000';

jest.mock('../models/User', () => ({
    exists: jest.fn(async () => ({ _id: 'mock-user' }))
}));

const pkceStore = require('../utils/pkceStore');
const {
    userExists,
    clearLivenessCache,
    pruneExpiredLivenessEntries,
    livenessCacheSize
} = require('../middleware/auth');

describe('figma PKCE store bounds', () => {
    beforeEach(() => pkceStore.clear());

    test('round-trips a verifier, rejects it after the TTL and deletes it', () => {
        pkceStore.set('user-1', 'verifier-1');
        expect(pkceStore.get('user-1')).toBe('verifier-1');

        const realNow = Date.now();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 60 * 1000);
        try {
            expect(pkceStore.get('user-1')).toBeNull();
        } finally {
            nowSpy.mockRestore();
        }
        expect(pkceStore.size()).toBe(0);
    });

    test('sweep prunes expired entries without a lookup', () => {
        pkceStore.set('user-1', 'verifier-1');
        pkceStore.set('user-2', 'verifier-2');

        expect(pkceStore.size()).toBe(2);
        expect(pkceStore.prune(Date.now() + 60 * 1000)).toBe(0);
    });

    test('hard cap evicts the oldest entries', () => {
        pkceStore.set('user-1', 'verifier-1');
        pkceStore.set('user-2', 'verifier-2');
        pkceStore.set('user-3', 'verifier-3');

        expect(pkceStore.size()).toBe(2);
        expect(pkceStore.get('user-1')).toBeNull();
        expect(pkceStore.get('user-3')).toBe('verifier-3');
    });
});

describe('liveness cache bounds', () => {
    beforeEach(() => clearLivenessCache());

    test('sweep drops entries once their TTL has passed', async () => {
        await userExists('user-1');
        expect(livenessCacheSize()).toBe(1);

        expect(pruneExpiredLivenessEntries(Date.now() + 60 * 1000)).toBe(0);
    });

    test('hard cap evicts the oldest entries instead of growing forever', async () => {
        await userExists('user-1');
        await userExists('user-2');
        await userExists('user-3');

        expect(livenessCacheSize()).toBe(2);
    });
});
