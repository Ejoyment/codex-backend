/**
 * runEphemeral is the provisioner's only execution path: array-form commands
 * run in a throwaway container with the workdir bind-mounted, and the
 * container is always removed afterwards (force-removed on timeout).
 */

const sandboxSecurity = require('../utils/sandboxSecurity');

function makeContainer(result = { StatusCode: 0 }, delayMs = 0) {
  return {
    start: jest.fn(async () => {}),
    wait: jest.fn(() => new Promise((resolve) => setTimeout(() => resolve(result), delayMs))),
    logs: jest.fn(async () => 'container output'),
    remove: jest.fn(async () => {}),
  };
}

describe('runEphemeral', () => {
  const originalDocker = sandboxSecurity.docker;
  afterAll(() => { sandboxSecurity.docker = originalDocker; });

  test('runs an array-form command in a locked-down container and removes it', async () => {
    const container = makeContainer();
    const createContainer = jest.fn(async () => container);
    sandboxSecurity.docker = { createContainer };

    const res = await sandboxSecurity.runEphemeral({
      hostDir: '/tmp/workspace-x',
      cmd: ['npm', 'install', '--no-audit', '--no-fund'],
      timeoutMs: 5000,
    });

    expect(res.output).toBe('container output');
    const cfg = createContainer.mock.calls[0][0];
    expect(cfg.Cmd).toEqual(['npm', 'install', '--no-audit', '--no-fund']);
    expect(cfg.WorkingDir).toBe('/workspace');
    expect(cfg.HostConfig.Binds).toEqual(['/tmp/workspace-x:/workspace:rw']);
    expect(cfg.HostConfig.NetworkMode).toBe('bridge');
    expect(cfg.HostConfig.Privileged).toBe(false);
    expect(cfg.HostConfig.CapDrop).toEqual(['ALL']);
    expect(cfg.HostConfig.SecurityOpt).toEqual(['no-new-privileges']);
    expect(container.start).toHaveBeenCalled();
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  test('honours SANDBOX_PROVISION_IMAGE', async () => {
    const container = makeContainer();
    const createContainer = jest.fn(async () => container);
    sandboxSecurity.docker = { createContainer };
    process.env.SANDBOX_PROVISION_IMAGE = 'node:20-alpine';
    try {
      await sandboxSecurity.runEphemeral({ hostDir: '/tmp/w', cmd: ['git', '--version'], timeoutMs: 5000 });
      expect(createContainer.mock.calls[0][0].Image).toBe('node:20-alpine');
    } finally {
      delete process.env.SANDBOX_PROVISION_IMAGE;
    }
  });

  test('rejects on non-zero exit and still removes the container', async () => {
    const container = makeContainer({ StatusCode: 128 });
    sandboxSecurity.docker = { createContainer: jest.fn(async () => container) };

    await expect(
      sandboxSecurity.runEphemeral({ hostDir: '/tmp/w', cmd: ['git', 'clone', 'x', '/workspace'], timeoutMs: 5000 })
    ).rejects.toThrow(/exit 128/);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  test('times out and force-removes a hung container', async () => {
    const container = makeContainer({ StatusCode: 0 }, 60);
    sandboxSecurity.docker = { createContainer: jest.fn(async () => container) };

    await expect(
      sandboxSecurity.runEphemeral({ hostDir: '/tmp/w', cmd: ['npm', 'install'], timeoutMs: 10 })
    ).rejects.toThrow(/timed out/);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  test('validates input and fails when Docker is missing', async () => {
    sandboxSecurity.docker = null;
    await expect(
      sandboxSecurity.runEphemeral({ hostDir: '/tmp/w', cmd: ['git'], timeoutMs: 10 })
    ).rejects.toThrow('Docker not available');

    sandboxSecurity.docker = { createContainer: jest.fn() };
    await expect(
      sandboxSecurity.runEphemeral({ hostDir: '/tmp/w', cmd: 'git clone x /workspace', timeoutMs: 10 })
    ).rejects.toThrow(/non-empty array/);
    await expect(
      sandboxSecurity.runEphemeral({ hostDir: 'relative/dir', cmd: ['git'], timeoutMs: 10 })
    ).rejects.toThrow(/absolute/);
  });
});
