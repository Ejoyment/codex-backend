const jwt = require('jsonwebtoken');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const SpecModel = require('../models/SpecModel');
const aiRouterService = require('./aiRouterService');
const sddVerificationService = require('./sddVerificationService');
const realtimeBus = require('./realtimeBus');
const gitService = require('./gitService');
const terminalService = require('./terminalService');
const containerWorker = require('./containerWorker');
const { execSync } = require('child_process');

class AgentSocketHandler {
  constructor(io) {
    this.io = io;
    this.executions = new Map();
    this.setupAgentNamespace();
  }

  setupAgentNamespace() {
    const agentNamespace = this.io.of('/agent');

    agentNamespace.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId || decoded.id || decoded._id;
        socket.user = decoded;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    agentNamespace.on('connection', (socket) => {
      console.log(`Agent socket connected: ${socket.userId}`);
      socket.join(`user:${socket.userId}`);
      socket.join(`agent:${socket.userId}`);

      socket.on('agent:delegate', async (data) => {
        await this.handleDelegate(socket, data);
      });

      socket.on('agent:cancel', async (data) => {
        await this.handleCancel(socket, data);
      });

      socket.on('agent:approve', async (data) => {
        await this.handleApprove(socket, data);
      });

      socket.on('agent:reject', async (data) => {
        await this.handleReject(socket, data);
      });

      socket.on('agent:tweak', async (data) => {
        await this.handleTweak(socket, data);
      });

      socket.on('agent:get-status', async (data) => {
        await this.handleGetStatus(socket, data);
      });

      socket.on('agent:verify-spec', async (data) => {
        await this.handleVerifySpec(socket, data);
      });

      socket.on('disconnect', () => {
        console.log(`Agent socket disconnected: ${socket.userId}`);
        for (const [executionId, execution] of this.executions) {
          if (execution.userId === socket.userId && execution.status === 'running') {
            execution.status = 'failed';
            execution.logs.push({ timestamp: new Date(), message: 'Connection lost - execution paused' });
            this.executions.set(executionId, execution);
          }
        }
      });
    });
  }

  async handleDelegate(socket, data) {
    const { taskId, taskTitle, sessionId, workspaceId, summary = '', specId, provider = 'gemini', localPrivacyMode = false } = data;

    try {
      const execution = await AgentExecution.create({
        userId: socket.userId,
        sessionId: sessionId || 'standalone-task',
        taskTitle: taskTitle || 'Agent task',
        summary,
        status: 'running',
        approvalRequired: true,
        metadata: {
          taskId: taskId || null,
          workspaceId: workspaceId || null,
          specId: specId || null,
          source: 'agent:delegate',
          provider,
          localPrivacyMode,
        },
      });

      if (taskId) {
        await LocalTask.findByIdAndUpdate(taskId, {
          status: 'in-progress',
          'agentExecution.status': 'running',
          'agentExecution.agentBranch': `agent/${taskId}`,
          'agentExecution.specRef': specId || null,
          updatedAt: new Date(),
        });
      }

      if (specId) {
        await SpecModel.findByIdAndUpdate(specId, { updatedAt: new Date() });
      }

      this.executions.set(execution._id.toString(), execution);

      realtimeBus.emitAgentProgress(socket.userId, {
        type: 'delegate',
        executionId: execution._id,
        taskId,
        status: 'running',
        provider,
        localPrivacyMode,
      });

      socket.join(`task:${taskId}`);
      socket.join(`task:${taskId}:logs`);

      socket.emit('agent:delegate-result', {
        success: true,
        execution,
        taskId,
      });

      this.executionLoop(execution, taskId, workspaceId, specId, provider, localPrivacyMode, socket);

      // Provision container worker if Docker is available
      if (workspaceId) {
        try {
          const containerResult = await containerWorker.provisionWorker(
            taskId,
            socket.userId,
            workspaceId,
            { specId, image: 'node:18-alpine' }
          );
          if (containerResult.success) {
            execution.metadata.containerId = containerResult.containerId;
            execution.logs.push({ timestamp: new Date(), message: `Container worker provisioned: ${containerResult.workerId}` });
            await execution.save();
            socket.emit('agent:container-provisioned', containerResult);
          }
        } catch (err) {
          console.warn('Container provisioning failed, using fallback:', err.message);
          execution.logs.push({ timestamp: new Date(), message: 'Container provisioning unavailable, using fallback execution' });
          await execution.save();
        }
      }

    } catch (error) {
      console.error('Agent delegate error:', error);
      socket.emit('agent:error', { message: error.message });
    }
  }

  async executionLoop(execution, taskId, workspaceId, specId, provider, localPrivacyMode, socket) {
    try {
      execution.status = 'running';
      execution.logs = [{ timestamp: new Date(), message: 'Agent execution started' }];
      await execution.save();

      const task = taskId ? await LocalTask.findById(taskId) : null;
      const spec = specId ? await SpecModel.findById(specId) : null;

      const messages = [
        { role: 'system', content: `You are an autonomous AI agent executing a task. Task: ${execution.taskTitle}` },
      ];
      if (spec && spec.content) {
        messages.push({ role: 'system', content: `Spec contract: ${spec.content}` });
      }
      if (task && task.description) {
        messages.push({ role: 'user', content: task.description });
      }

      const codeContext = {
        workspaceId,
        files: [],
        agentMode: true,
        instructions: spec ? `Follow the spec contract: ${spec.specId}` : undefined,
      };

      const result = await aiRouterService.routeChat(messages, codeContext, { provider, localPrivacyMode });

      if (result.success) {
        execution.status = 'awaiting_approval';
        execution.logs.push({ timestamp: new Date(), message: 'Agent completed execution, awaiting approval' });
        execution.diffSummary = {
          filesChanged: result.codeBlocks ? result.codeBlocks.length : 0,
          insertions: result.codeBlocks ? result.codeBlocks.reduce((acc, c) => acc + c.code.split('\n').length, 0) : 0,
          deletions: 0,
        };

        realtimeBus.emitAgentProgress(socket.userId, {
          type: 'complete',
          executionId: execution._id,
          status: 'awaiting_approval',
          result,
        });

        socket.emit('agent:execution-complete', {
          execution,
          result,
          status: 'awaiting_approval',
        });
      } else {
        execution.status = 'failed';
        execution.logs.push({ timestamp: new Date(), message: `Agent execution failed: ${result.error}` });

        realtimeBus.emitAgentProgress(socket.userId, {
          type: 'error',
          executionId: execution._id,
          status: 'failed',
          error: result.error,
        });

        socket.emit('agent:execution-error', {
          execution,
          error: result.error,
          status: 'failed',
        });
      }

      await execution.save();
    } catch (error) {
      execution.status = 'failed';
      execution.logs.push({ timestamp: new Date(), message: `Execution error: ${error.message}` });
      await execution.save();
      socket.emit('agent:error', { message: error.message });
    }
  }

  async handleCancel(socket, data) {
    const { executionId } = data;
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    execution.status = 'failed';
    execution.logs.push({ timestamp: new Date(), message: 'Execution cancelled by user' });
    await execution.save();

    this.executions.delete(executionId);

    socket.emit('agent:cancelled', { executionId, status: 'failed' });

    realtimeBus.emitAgentProgress(socket.userId, {
      type: 'cancel',
      executionId,
      status: 'failed',
    });
  }

  async handleApprove(socket, data) {
    const { executionId, taskId } = data;
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    execution.status = 'completed';
    execution.approvalRequired = false;
    execution.logs.push({ timestamp: new Date(), message: 'Agent changes approved and merged' });
    await execution.save();

    if (taskId) {
      await LocalTask.findByIdAndUpdate(taskId, {
        status: 'completed',
        completedAt: new Date(),
        'agentExecution.status': 'completed',
        updatedAt: new Date(),
      });
    }

try {
        if (execution.metadata?.agentBranch) {
          await gitService.merge(execution.metadata.workspaceId || 'default', execution.metadata.agentBranch);
        }
      } catch (error) {
        console.error('Git merge error:', error);
      }
      execution.logs.push({ timestamp: new Date(), message: `Merge warning: ${error.message}` });

      if (execution.metadata?.containerId) {
        try { await containerWorker.teardownWorker(taskId); } catch {}
      }

      socket.emit('agent:approved', { execution, taskId, message: 'Changes approved and merged' });

    realtimeBus.emitAgentProgress(socket.userId, {
      type: 'approve',
      executionId,
      status: 'completed',
    });
  }

  async handleReject(socket, data) {
    const { executionId, taskId } = data;
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    execution.status = 'rejected';
    execution.approvalRequired = false;
    execution.logs.push({ timestamp: new Date(), message: 'Agent work rejected and task rolled back' });
    await execution.save();

    if (taskId) {
      await LocalTask.findByIdAndUpdate(taskId, {
        status: 'in-progress',
        'agentExecution.status': 'rejected',
        updatedAt: new Date(),
      });
    }

try {
        if (execution.metadata?.agentBranch) {
          await gitService.reset(execution.metadata.workspaceId || 'default', [execution.metadata.agentBranch]);
        }
      } catch (error) {
        console.error('Git reset error:', error);
      }

      if (execution.metadata?.containerId) {
        try { await containerWorker.teardownWorker(taskId); } catch {}
      }

      socket.emit('agent:rejected', { execution, taskId, message: 'Changes rejected and rolled back' });

    realtimeBus.emitAgentProgress(socket.userId, {
      type: 'reject',
      executionId,
      status: 'rejected',
    });
  }

  async handleTweak(socket, data) {
    const { executionId, taskId, feedback } = data;
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    execution.status = 'running';
    execution.logs.push({ timestamp: new Date(), message: `Re-running agent with feedback: ${feedback}` });
    await execution.save();

    const messages = [
      { role: 'system', content: `Re-running agent with feedback: ${feedback}` },
      { role: 'user', content: feedback },
    ];

    const result = await aiRouterService.routeChat(messages, {}, { provider: execution.metadata?.provider || 'gemini' });

    if (result.success) {
      execution.logs.push({ timestamp: new Date(), message: 'Agent re-execution completed with feedback' });
      socket.emit('agent:tweak-result', { execution, result });
    } else {
      socket.emit('agent:error', { message: result.error });
    }
  }

  async handleGetStatus(socket, data) {
    const { taskId } = data;
    const execution = await AgentExecution.findOne({
      userId: socket.userId,
      ...(taskId ? { 'metadata.taskId': taskId } : {}),
    }).sort({ createdAt: -1 });

    if (!execution) {
      return socket.emit('agent:error', { message: 'No execution found' });
    }

    socket.emit('agent:status', { execution });
  }

  async handleVerifySpec(socket, data) {
    const { specId, taskId } = data;
    const result = await sddVerificationService.verifySpec(specId, taskId);
    socket.emit('agent:spec-verification', result);
  }
}

module.exports = AgentSocketHandler;