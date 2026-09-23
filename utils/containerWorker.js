const dockerode = require('dockerode');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const docker = new dockerode({ socketPath: '/var/run/docker.sock' });

class ContainerWorkerService {
  constructor() {
    this.activeWorkers = new Map();
    this.dockerAvailable = false;
    this.initialize();
  }

  async initialize() {
    try {
      const versions = await docker.version();
      this.dockerAvailable = !!versions.Version;
      console.log(`✓ Container Worker Service initialized. Docker available: ${this.dockerAvailable}`);
    } catch (error) {
      console.warn('⚠ Docker not available. Container worker provisioning disabled.');
      this.dockerAvailable = false;
    }
  }

  async provisionWorker(taskId, userId, workspaceId, options = {}) {
    if (!this.dockerAvailable) {
      return {
        success: false,
        message: 'Docker not available. Using fallback execution.',
        fallback: true,
      };
    }

    const workerId = `agent-${taskId}`;
    const image = options.image || 'node:18-alpine';
    const workspacePath = `/workspace/${workspaceId}/${taskId}`;

    try {
      const container = await docker.createContainer({
        Image: image,
        name: workerId,
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Env: [
          `TASK_ID=${taskId}`,
          `USER_ID=${userId}`,
          `WORKSPACE_ID=${workspaceId}`,
          `AGENT_BRANCH=agent/${taskId}`,
          `SPEC_ID=${options.specId || ''}`,
        ],
        HostConfig: {
          AutoRemove: true,
          Mounts: [
            {
              Source: path.join('/tmp', 'codex-workspaces', workspaceId),
              Target: '/workspace',
              Type: 'bind',
            },
          ],
          NetworkMode: 'host',
          Memory: options.memoryLimit || 512 * 1024 * 1024,
          NanoCpus: options.cpuLimit || 1000000000,
          Privileged: false,
          ReadonlyRootfs: true,
          NoNewPrivileges: true,
        },
      });

      await container.start();

      const workerInfo = {
        id: workerId,
        containerId: container.id,
        taskId,
        userId,
        workspaceId,
        status: 'running',
        startedAt: new Date(),
        image,
        logs: [],
      };

      this.activeWorkers.set(workerId, workerInfo);

      console.log(`✓ Container worker provisioned: ${workerId}`);

      return {
        success: true,
        workerId,
        containerId: container.id,
        image,
        workspacePath,
      };
    } catch (error) {
      console.error('Container provisioning error:', error.message);
      return {
        success: false,
        message: error.message,
        fallback: true,
      };
    }
  }

  async teardownWorker(taskId) {
    const workerId = `agent-${taskId}`;
    const worker = this.activeWorkers.get(workerId);

    if (!worker) {
      return { success: false, message: 'Worker not found' };
    }

    try {
      const container = docker.getContainer(worker.containerId);
      await container.stop({ timeout: 10 });
      await container.remove();
      this.activeWorkers.delete(workerId);

      console.log(`✓ Container worker torn down: ${workerId}`);

      return { success: true, workerId };
    } catch (error) {
      console.error('Container teardown error:', error.message);
      return { success: false, message: error.message };
    }
  }

  async getWorkerLogs(taskId) {
    const workerId = `agent-${taskId}`;
    const worker = this.activeWorkers.get(workerId);

    if (!worker) {
      return [];
    }

    try {
      const container = docker.getContainer(worker.containerId);
      const logs = await container.logs({ stdout: true, stderr: true, tail: '100' });
      return logs.toString().split('\n').filter(Boolean);
    } catch (error) {
      return [`Error fetching logs: ${error.message}`];
    }
  }

  async executeInContainer(taskId, command, options = {}) {
    const worker = this.activeWorkers.get(`agent-${taskId}`);
    if (!worker) {
      return { success: false, message: 'Worker not found' };
    }

    try {
      const container = docker.getContainer(worker.containerId);
      const exec = await container.exec({
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
      });

      const result = await exec.start();
      const output = await container.logs({ stdout: true, stderr: true });

      return {
        success: result.StatusCode === 0,
        output: output.toString(),
        exitCode: result.StatusCode,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  isAvailable() {
    return this.dockerAvailable;
  }

  getActiveWorkers() {
    return Array.from(this.activeWorkers.values());
  }

  async cleanupExpired() {
    for (const [workerId, worker] of this.activeWorkers) {
      try {
        const container = docker.getContainer(worker.containerId);
        const info = await container.inspect();
        if (info.State.Status === 'exited') {
          await container.remove();
          this.activeWorkers.delete(workerId);
          console.log(`Cleaned up expired worker: ${workerId}`);
        }
      } catch {
        this.activeWorkers.delete(workerId);
      }
    }
  }
}

module.exports = new ContainerWorkerService();