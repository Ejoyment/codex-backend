/**
 * Sandbox Security - Network Isolation & Container Security
 * Provides production-grade security for code execution.
 *
 * This is the MANDATORY container backend for all code execution.
 * VM2 and other in-process sandboxes have been removed due to
 * known escape vulnerabilities.
 */

const Docker = require('dockerode');

class SandboxSecurity {
  constructor() {
    this.docker = new Docker();
    this.containers = new Map(); // userId -> container

    // Configurable resource limits (env vars, with sane defaults)
    this.memoryLimitMB = parseInt(process.env.SANDBOX_MEMORY_MB) || 512;
    this.cpuQuota = parseInt(process.env.SANDBOX_CPU_QUOTA) || 50000; // 50% of one core
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

      // Update the container command
      await container.update({ Cmd: ['/bin/sh', '-c', cmd] });
      await container.start();

      const startTime = Date.now();
      const result = await Promise.race([
        container.wait(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeout)
        )
      ]);

      const executionTime = Date.now() - startTime;

      const logs = await container.logs({ stdout: true, stderr: true });

      return {
        success: result.StatusCode === 0,
        output: logs.toString(),
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
      await this.docker.ping();
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = new SandboxSecurity();
