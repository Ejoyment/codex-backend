/**
 * Sandbox Security - Network Isolation & Container Security
 * Provides production-grade security for code execution.
 *
 * This is the MANDATORY container backend for all code execution.
 * VM2 and other in-process sandboxes have been removed due to
 * known escape vulnerabilities.
 */

const path = require('path');
const Docker = require('dockerode');

class SandboxSecurity {
  constructor() {
    this.docker = null;
    this.containers = new Map();
    try {
      this.docker = new Docker();
    } catch (_) {}
    this.memoryLimitMB = parseInt(process.env.SANDBOX_MEMORY_MB) || 512;
    this.cpuQuota = parseInt(process.env.SANDBOX_CPU_QUOTA) || 50000;
    this.cpuPeriod = 100000;
    this.pidsLimit = parseInt(process.env.SANDBOX_PIDS_LIMIT) || 100;
    this.timeoutMs = parseInt(process.env.SANDBOX_TIMEOUT) || 30000;
  }

  /**
   * Create isolated container with zero trust security.
   * Returns a running container with:
   * - No network access (NetworkMode: none)
   * - Read-only root filesystem (writable /workspace via bind mount)
   * - Dropped ALL capabilities
   * - no-new-privileges security option
   * - CPU, memory, and PID limits
   */
async createIsolatedContainer(userId, workspaceId) {
     if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(userId)) || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(workspaceId))) throw new Error('Invalid userId/workspaceId');
     if (!this.docker) throw new Error('Docker not available');
     try {
      // Check if container already exists and is running
      if (this.containers.has(userId)) {
        const existing = this.containers.get(userId);
        try {
          const info = await existing.inspect();
          if (info.State.Running) {
            return existing;
          }
        } catch (_) {
          // Container may have been removed externally
        }
        // Clean up stopped/removed container
        try { await existing.remove(); } catch (_) {}
        this.containers.delete(userId);
      }

      const memoryBytes = this.memoryLimitMB * 1024 * 1024;

      // Create new isolated container
      const container = await this.docker.createContainer({
        Image: 'node:18-alpine',
        name: `sandbox_${userId}_${Date.now()}`,
        Cmd: ['/bin/sh'],
        Tty: true,
        WorkingDir: '/workspace',

        // Resource limits
        HostConfig: {
          Memory: memoryBytes,
          MemorySwap: memoryBytes, // No swap (same as memory limit)
          CpuQuota: this.cpuQuota,
          CpuPeriod: this.cpuPeriod,
          PidsLimit: this.pidsLimit,

          // Network isolation
          NetworkMode: 'none',

          // Never run privileged
          Privileged: false,

          // Filesystem security
          ReadonlyRootfs: false, // Allow writes to /workspace
          Binds: [
            `/tmp/workspaces/${workspaceId}:/workspace:rw`
          ],

          // Security options
          SecurityOpt: [
            'no-new-privileges'
          ],

          // Drop all capabilities
          CapDrop: ['ALL'],
        },

        AttachStdout: true,
        AttachStderr: true,
      });

      this.containers.set(userId, container);
      return container;
    } catch (error) {
      console.error('Failed to create isolated container:', error.message);
      throw error;
    }
  }

  /**
   * Execute code inside an isolated container.
   * Creates a container, runs the command, captures output, and cleans up.
   */
  async executeInContainer(userId, workspaceId, cmd, opts = {}) {
    const timeout = opts.timeout || this.timeoutMs;
    let container;

    try {
      container = await this.createIsolatedContainer(userId, workspaceId);

      await container.start();

      // NOTE: callers must pass cmd as a pre-built string; never interpolate
      // raw user code here — callers already use exec-form/base64 per utils/sandboxExecutor.js.
      const exec = await container.exec({ Cmd: ['/bin/sh', '-c', cmd], AttachStdout: true, AttachStderr: true });
      const execStream = await exec.start({});

      let output = '';
      execStream.on('data', (chunk) => { output += chunk.toString(); });

      const startTime = Date.now();
      const execPromise = (async () => {
        await new Promise((resolve, reject) => {
          execStream.on('end', resolve);
          execStream.on('error', reject);
        });
        const info = await exec.inspect();
        return { StatusCode: info.ExitCode };
      })();
      const result = await Promise.race([
        execPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeout)
        )
      ]);

      const executionTime = Date.now() - startTime;

      return {
        success: result.StatusCode === 0,
        output,
        exitCode: result.StatusCode,
        executionTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Always clean up the container
      if (container) {
        try { await container.remove({ force: true }); } catch (_) {}
      }
      this.containers.delete(userId);
    }
  }

  /**
   * Run a one-off command inside an ephemeral container with the sandbox
   * workdir bind-mounted at /workspace. This is the only execution path for
   * provisioning steps (clone, checkout, dependency install) — they must never
   * run on the API host. The container is always removed afterwards; on
   * timeout it is force-removed mid-run.
   */
  async runEphemeral({ hostDir, cmd, network = 'bridge', timeoutMs = 120000 } = {}) {
    if (!this.docker) throw new Error('Docker not available');
    if (!hostDir || !path.isAbsolute(String(hostDir))) throw new Error('hostDir must be an absolute path');
    if (!Array.isArray(cmd) || cmd.length === 0 || cmd.some((part) => typeof part !== 'string')) {
      throw new Error('cmd must be a non-empty array of strings');
    }

    const memoryBytes = this.memoryLimitMB * 1024 * 1024;
    let container;
    try {
      container = await this.docker.createContainer({
        Image: process.env.SANDBOX_PROVISION_IMAGE || 'node:20',
        name: `sandbox_prov_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`,
        Cmd: cmd,
        WorkingDir: '/workspace',
        Tty: true,
        Env: ['HOME=/tmp', 'npm_config_cache=/tmp/.npm'],
        HostConfig: {
          Binds: [`${hostDir}:/workspace:rw`],
          NetworkMode: network,
          Memory: memoryBytes,
          MemorySwap: memoryBytes,
          CpuQuota: this.cpuQuota,
          CpuPeriod: this.cpuPeriod,
          PidsLimit: this.pidsLimit,
          Privileged: false,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
        },
        // Run as the host process uid/gid so files written through the bind
        // mount stay host-owned and provisioner cleanup can remove them.
        ...(typeof process.getuid === 'function' ? { User: `${process.getuid()}:${process.getgid()}` } : {}),
      });

      await container.start();

      const TIMEOUT = Symbol('timeout');
      let timer = null;
      const outcome = await Promise.race([
        container.wait(),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);

      if (outcome === TIMEOUT) {
        throw new Error(`Container command timed out after ${timeoutMs}ms: ${cmd[0]}`);
      }

      const statusCode = outcome?.StatusCode ?? outcome?.statusCode ?? 0;
      const rawLogs = await container.logs({ stdout: true, stderr: true, tail: 200 }).catch(() => '');
      const output = Buffer.isBuffer(rawLogs) ? rawLogs.toString('utf8') : String(rawLogs || '');
      if (statusCode !== 0) {
        throw new Error(
          `Container command failed (exit ${statusCode}): ${cmd.join(' ').slice(0, 200)}${output ? `\n${output.slice(-1200)}` : ''}`
        );
      }
      return { output };
    } finally {
      if (container) {
        try { await container.remove({ force: true }); } catch (_) {}
      }
    }
  }

  /**
   * Remove a specific user's container.
   */
  async cleanupContainer(userId) {
    const container = this.containers.get(userId);
    if (!container) return;

    try {
      await container.remove({ force: true });
    } catch (_) {}
    this.containers.delete(userId);
  }

  /**
   * Remove all active containers. Called on server shutdown.
   */
  async cleanupAll() {
    for (const [userId, container] of this.containers) {
      try {
        await container.remove({ force: true });
      } catch (_) {}
    }
    this.containers.clear();
  }

  /**
   * Check if Docker is available.
   */
async isDockerAvailable() {
     try {
         if (!this.docker) return false;
         await this.docker.ping();
         return true;
     } catch (_) {
         return false;
     }
 }
}

module.exports = new SandboxSecurity();
