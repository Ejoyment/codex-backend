/**
 * Host debugging policy: off in production unless explicitly opted in, and
 * child processes never inherit the server's secrets.
 */

jest.mock('child_process', () => ({ spawn: jest.fn() }));

const { spawn } = require('child_process');
const debugAdapter = require('../utils/debugAdapter');

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
});

describe('debug host execution policy', () => {
    test('is disabled in production by default', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.IDE_ALLOW_HOST_EXEC;
        expect(debugAdapter.hostExecutionAllowed()).toBe(false);
    });

    test('requires an explicit opt-in in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.IDE_ALLOW_HOST_EXEC = 'true';
        expect(debugAdapter.hostExecutionAllowed()).toBe(true);
    });

    test('launch fails in production before spawning anything', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.IDE_ALLOW_HOST_EXEC;

        const session = await debugAdapter.createSession('user1', 'workspace1', {});
        await expect(
            debugAdapter.launch(session.id, { program: '/tmp/x.js', language: 'javascript' })
        ).rejects.toThrow(/disabled/i);

        expect(spawn).not.toHaveBeenCalled();
    });

    test('childEnv drops server secrets and keeps interpreter basics', () => {
        process.env.SECRET_MARKER = 'must-not-leak';
        process.env.MONGODB_URI = 'mongodb://must-not-leak';
        process.env.JWT_SECRET = 'must-not-leak';

        const env = debugAdapter.childEnv({ USER_EXTRA: 'ok' });

        expect(env.SECRET_MARKER).toBeUndefined();
        expect(env.MONGODB_URI).toBeUndefined();
        expect(env.JWT_SECRET).toBeUndefined();
        expect(env.USER_EXTRA).toBe('ok');
        expect(env.PATH).toBe(process.env.PATH);
    });
});
