/**
 * The provisioner must never run repo commands on the API host: clone,
 * checkout, and npm install go through ephemeral Docker containers, and when
 * Docker is unavailable the steps are skipped instead of falling back to host
 * execution. The snapshot preview must work in every path.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn(),
  execFile: jest.fn(),
}));
jest.mock('../utils/sandboxSecurity', () => ({
  isDockerAvailable: jest.fn(),
  runEphemeral: jest.fn(),
}));
jest.mock('../models/DebugHandoff', () => ({ updateOne: jest.fn(async () => ({})) }));

const childProcess = require('child_process');
const sandboxSecurity = require('../utils/sandboxSecurity');
const provisioner = require('../utils/sandboxProvisioner');

function makeSandbox(overrides = {}) {
  return {
    sandboxKey: 'sb_test123',
    repository: 'https://github.com/acme/app.git',
    branch: 'feature/x',
    commitSha: 'abc1234',
    envVars: { NODE_ENV: 'test', JWT_SECRET: 'super-secret' },
    files: [{ path: 'src/bug.js', content: 'console.log("bug")' }],
    _codeSnapshot: {},
    status: 'provisioning',
    logs: '',
    save: jest.fn(async () => {}),
    ...overrides,
  };
}

const workdirs = [];
function makeWorkdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-provision-'));
  workdirs.push(dir);
  return dir;
}

beforeEach(() => {
  jest.clearAllMocks();
  sandboxSecurity.isDockerAvailable.mockResolvedValue(true);
  sandboxSecurity.runEphemeral.mockResolvedValue({ output: '' });
});

afterEach(() => {
  provisioner.stopAll();
});

afterAll(() => {
  workdirs.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
});

describe('provisionPipeline', () => {
  test('runs clone, checkout and install in containers; snapshot overlaid; no host exec', async () => {
    // Emulate the clone by leaving a package.json behind so the install step runs.
    sandboxSecurity.runEphemeral.mockImplementation(async ({ cmd, hostDir }) => {
      if (cmd[0] === 'git' && cmd[1] === 'clone') {
        fs.writeFileSync(path.join(hostDir, 'package.json'), '{"name":"app"}');
      }
      return { output: '' };
    });

    const sandbox = makeSandbox();
    const workdir = makeWorkdir();
    await provisioner.provisionPipeline(sandbox, workdir);

    expect(sandbox.status).toBe('ready');
    const calls = sandboxSecurity.runEphemeral.mock.calls.map(([arg]) => arg);
    expect(calls.map((c) => c.cmd)).toEqual([
      ['git', 'clone', '--depth', '1', '--branch', 'feature/x', 'https://github.com/acme/app.git', '/workspace'],
      ['git', '-C', '/workspace', 'checkout', 'abc1234'],
      ['npm', 'install', '--no-audit', '--no-fund'],
    ]);
    calls.forEach((c) => {
      expect(c.network).toBe('bridge');
      expect(c.hostDir).toBe(workdir);
    });
    expect(calls[0].timeoutMs).toBe(120000);
    expect(calls[1].timeoutMs).toBe(60000);
    expect(calls[2].timeoutMs).toBe(180000);

    expect(childProcess.exec).not.toHaveBeenCalled();
    expect(childProcess.spawn).not.toHaveBeenCalled();

    // Buggy file overlaid on the clone + env persisted redacted.
    expect(fs.readFileSync(path.join(workdir, 'src/bug.js'), 'utf8')).toBe('console.log("bug")');
    const envFile = fs.readFileSync(path.join(workdir, '.env.sandbox'), 'utf8');
    expect(envFile).toContain('NODE_ENV=test');
    expect(envFile).toContain('JWT_SECRET=***REDACTED***');
  });

  test('main branch clones the default branch (no --branch flag) and skips checkout', async () => {
    const sandbox = makeSandbox({ branch: 'main', commitSha: null });
    await provisioner.provisionPipeline(sandbox, makeWorkdir());

    expect(sandbox.status).toBe('ready');
    expect(sandboxSecurity.runEphemeral.mock.calls[0][0].cmd).toEqual([
      'git', 'clone', '--depth', '1', 'https://github.com/acme/app.git', '/workspace',
    ]);
    // No checkout call, no install call (cluster returned no package.json).
    expect(sandboxSecurity.runEphemeral).toHaveBeenCalledTimes(1);
  });

  test('Docker unavailable: clone/install skipped, snapshot preview still ready, no host exec', async () => {
    sandboxSecurity.isDockerAvailable.mockResolvedValue(false);
    const sandbox = makeSandbox();
    const workdir = makeWorkdir();
    await provisioner.provisionPipeline(sandbox, workdir);

    expect(sandbox.status).toBe('ready');
    expect(sandboxSecurity.runEphemeral).not.toHaveBeenCalled();
    expect(childProcess.exec).not.toHaveBeenCalled();
    expect(sandbox.logs).toContain('[docker] Docker unavailable');
    expect(fs.existsSync(path.join(workdir, 'src/bug.js'))).toBe(true);
  });

  test('clone failure degrades to snapshot preview instead of failing', async () => {
    sandboxSecurity.runEphemeral.mockRejectedValue(new Error('Container command failed (exit 128)'));
    const sandbox = makeSandbox();
    const workdir = makeWorkdir();
    await provisioner.provisionPipeline(sandbox, workdir);

    expect(sandbox.status).toBe('ready');
    expect(sandbox.logs).toContain('[clone]');
    expect(fs.existsSync(path.join(workdir, 'src/bug.js'))).toBe(true);
    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  test('dangerous repo URL fails the sandbox without any container run', async () => {
    const sandbox = makeSandbox({ repository: 'ext::sh -c whoami' });
    await provisioner.provisionPipeline(sandbox, makeWorkdir());

    expect(sandbox.status).toBe('failed');
    expect(sandboxSecurity.runEphemeral).not.toHaveBeenCalled();
    expect(sandbox.logs).toContain('[security]');
  });

  test('invalid branch or commit fails closed before any container run', async () => {
    const sandbox = makeSandbox({ branch: '-dangerous' });
    await provisioner.provisionPipeline(sandbox, makeWorkdir());

    expect(sandbox.status).toBe('failed');
    expect(sandbox.error).toBe('Invalid branch');
    expect(sandboxSecurity.runEphemeral).not.toHaveBeenCalled();
    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  test('sandbox without a repository still writes the snapshot preview', async () => {
    const sandbox = makeSandbox({ repository: null, branch: 'main', commitSha: null });
    const workdir = makeWorkdir();
    await provisioner.provisionPipeline(sandbox, workdir);

    expect(sandbox.status).toBe('ready');
    expect(sandboxSecurity.runEphemeral).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workdir, 'src/bug.js'))).toBe(true);
  });
});
