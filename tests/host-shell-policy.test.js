/**
 * Production must never spawn a host shell by default. VPS transport is the
 * supported path; a host fallback requires an explicit opt-in.
 */

const terminalService = require('../utils/terminalService');
const { hostShellAllowed } = require('../utils/terminalService');
const { validateBootConfig } = require('../utils/bootConfig');

const ENV_KEYS = [
    'NODE_ENV',
    'TERMINAL_ALLOW_HOST_EXEC',
    'TERMINAL_EXEC_MODE',
    'TERMINAL_SSH_HOST',
    'DEPLOY_SSH_HOST',
    'IDE_TERMINAL_TRANSPORT',
];

const savedEnv = { ...process.env };

beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
    process.env = { ...savedEnv };
    jest.restoreAllMocks();
});

describe('host shell policy', () => {
    test('is allowed outside production', () => {
        process.env.NODE_ENV = 'test';
        expect(hostShellAllowed()).toBe(true);
    });

    test('is disabled in production by default', () => {
        process.env.NODE_ENV = 'production';
        expect(hostShellAllowed()).toBe(false);
    });

    test('requires an explicit opt-in in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.TERMINAL_ALLOW_HOST_EXEC = 'true';
        expect(hostShellAllowed()).toBe(true);
    });

    test('createTerminal fails with 503 in production before spawning', async () => {
        process.env.NODE_ENV = 'production';
        process.env.IDE_TERMINAL_TRANSPORT = 'local';

        const originalUsePty = terminalService.usePty;
        const originalPty = terminalService.pty;
        const spawn = jest.fn();
        terminalService.usePty = true;
        terminalService.pty = { spawn };

        try {
            await expect(
                terminalService.createTerminal('user-1', 'user-1', {})
            ).rejects.toMatchObject({ statusCode: 503 });
            expect(spawn).not.toHaveBeenCalled();
        } finally {
            terminalService.usePty = originalUsePty;
            terminalService.pty = originalPty;
        }
    });

    test('boot config warns when production has no isolated terminal backend', () => {
        process.env.NODE_ENV = 'production';
        process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
        process.env.JWT_SECRET = 'x'.repeat(32);
        process.env.FRONTEND_URL = 'https://app.example.com';
        delete process.env.TERMINAL_SSH_HOST;
        delete process.env.DEPLOY_SSH_HOST;

        const { warnings } = validateBootConfig();
        expect(warnings.join(' ')).toMatch(/fail closed in production/);
    });
});
