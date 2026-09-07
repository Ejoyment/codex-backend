/**
 * Sandbox Security - Network Isolation & Container Security
 * Provides production-grade security for code execution
 */

const Docker = require('dockerode');

class SandboxSecurity {
  constructor() {
    this.docker = new Docker();
    this.containers = new Map(); // userId -> container
  }

  /**
   * Create isolated container with zero trust security
   */
  async createIsolatedContainer(userId, workspaceId) {
    try {
      // Check if container already exists
      if (this.containers.has(userId)) {
        const existing = this.containers.get(userId);
        const info = await existing.inspect();
        
        if (info.State.Running) {
          return existing;
        } else {
          // Clean up stopped container
          await existing.remove();
          this.containers.delete(userId);
        }
      }

      // Create new isolated container
      const container = await this.docker.createContainer({
        Image: 'node:18-alpine',
        name: `sandbox_${userId}_${Date.now()}`,
        Cmd: ['/bin/sh'],
        Tty: true,
        WorkingDir: '/workspace',
        
        // Resource limits
        HostConfig: {
          Memory: 512 * 1024 * 1024, // 512MB RAM
          MemorySwap: 512 * 1024 * 1024, // No swap
          CpuQuota: 50000, // 50% CPU
          CpuPeriod: 100000,
          PidsLimit: 100, // Max 100 processes
          
          // Network isolation
          NetworkMode: 'none', // No network access by default
          
          // Filesystem security
          ReadonlyRootfs: false, // Allow writes to /workspace
          Binds: [
            // Mount workspace as volume
            `/tmp/workspaces/${workspaceId}:/workspace:rw`
          ],
          
          // Security options
          SecurityOpt: [
            'no-new-privileges', // Prevent privilege escalation
            'seccomp=unconfined' // Allow syscalls (can be restricted further)
          ],
          
          // Drop all capabilities
          CapDrop: ['ALL'],
          
          // Add only neces