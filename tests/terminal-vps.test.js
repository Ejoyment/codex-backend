/**
 * Dedicated terminal VPS (greyed out until provisioned).
 *
 * With only DEPLOY_SSH_* set, every lookup resolves exactly as before
 * (byte-identical behavior). Setting TERMINAL_SSH_HOST (+ key) reroutes
 * terminal shells to the separate host with no other code changes.
 */
const {
  hasVpsSshConfig,
  hasTerminalVpsConfig,
  terminalSshOpt,
  terminalTransportEnabled,
} = require('../utils/vpsShell');
const { terminalExecMode } = require('../utils/terminalService');
const { validateBootConfig } = require('../utils/bootConfig');

const SSH_KEYS = [
  'DEPLOY_SSH_HOST', 'DEPLOY_SSH_KEY', 'DEPLOY_SSH_KEY_FILE', 'DEPLOY_SSH_PORT', 'DEPLOY_SSH_USER',
  'TERMINAL_SSH_HOST', 'TERMINAL_SSH_KEY', 'TERMINAL_SSH_KEY_FILE', 'TERMINAL_SSH_PORT', 'TERMINAL_SSH_USER',
  'IDE_TERMINAL_TRANSPORT', 'MONGODB_URI', 'JWT_SECRET',
];

const savedEnv = { ...process.env };
beforeEach(() => {
  for (const k of SSH_KEYS) delete process.env[k];
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('dedicated terminal VPS detection', () => {
  test('absent without host, present with host + key', () => {
    expect(hasTerminalVpsConfig()).toBe(false);
    process.env.TERMINAL_SSH_HOST = 'term.example.com';
    expect(hasTerminalVpsConfig()).toBe(false);
    process.env.TERMINAL_SSH_KEY = 'k';
    expect(hasTerminalVpsConfig()).toBe(true);
  });

  test('per-option resolution prefers dedicated, falls back to deploy', () => {
    process.env.DEPLOY_SSH_HOST = 'deploy.example.com';
    process.env.DEPLOY_SSH_PORT = '2222';
    process.env.DEPLOY_SSH_USER = 'deployer';
    expect(terminalSshOpt('HOST')).toBe('deploy.example.com');
    expect(terminalSshOpt('PORT', '22')).toBe('2222');
    expect(terminalSshOpt('USER', 'deployer')).toBe('deployer');
    expect(terminalSshOpt('MISSING', 'dflt')).toBe('dflt');

    process.env.TERMINAL_SSH_HOST = 'term.example.com';
    process.env.TERMINAL_SSH_PORT = '2200';
    expect(terminalSshOpt('HOST')).toBe('term.example.com');
    expect(terminalSshOpt('PORT', '22')).toBe('2200');
    // USER has no TERMINAL_ override -> deploy value preserved.
    expect(terminalSshOpt('USER', 'deployer')).toBe('deployer');
  });
});

describe('transport selection unchanged when dedicated VPS absent', () => {
  test('legacy deploy-only behavior is identical', () => {
    expect(terminalTransportEnabled()).toBe(false);
    process.env.DEPLOY_SSH_HOST = 'h';
    process.env.DEPLOY_SSH_KEY = 'k';
    expect(hasVpsSshConfig()).toBe(true);
    expect(terminalTransportEnabled()).toBe(true);
    process.env.IDE_TERMINAL_TRANSPORT = 'local';
    expect(terminalTransportEnabled()).toBe(false);
  });

  test('dedicated host alone enables transport', () => {
    process.env.TERMINAL_SSH_HOST = 't';
    process.env.TERMINAL_SSH_KEY = 'k';
    expect(terminalTransportEnabled()).toBe(true);
  });
});

describe('terminalExecMode kill-switch', () => {
  test('auto by default, container on request', () => {
    expect(terminalExecMode()).toBe('auto');
    process.env.TERMINAL_EXEC_MODE = 'container';
    expect(terminalExecMode()).toBe('container');
    process.env.TERMINAL_EXEC_MODE = 'CONTAINER';
    expect(terminalExecMode()).toBe('container');
    process.env.TERMINAL_EXEC_MODE = 'bogus';
    expect(terminalExecMode()).toBe('auto');
  });
});

describe('bootConfig terminal warnings', () => {  test('half-configured dedicated VPS warns', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.TERMINAL_SSH_HOST = 't';
    const { warnings, fatals } = validateBootConfig();
    expect(fatals).toEqual([]);
    expect(warnings.join(' ')).toMatch(/TERMINAL_SSH_HOST/);
  });
});

describe('createTerminal kill-switch', () => {
  test('container mode without an isolated backend refuses with 503', async () => {
    process.env.TERMINAL_EXEC_MODE = 'container';
    process.env.IDE_TERMINAL_TRANSPORT = 'local';
    const terminalService = require('../utils/terminalService');
    // Personal workspace (userId === workspaceId) skips the DB access check.
    await expect(
      terminalService.createTerminal('user-1', 'user-1', {})
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
