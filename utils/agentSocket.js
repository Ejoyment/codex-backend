const { resolveSocketUser } = require('./socketAuth');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const SpecModel = require('../models/SpecModel');
const { userCanAccessSpec, userCanAccessWorkspace } = require('./specAccess');
const aiRouterService = require('./aiRouterService');
const sddVerificationService = require('./sddVerificationService');
const agentChangeSet = require('./agentChangeSet');
const realtimeBus = require('./realtimeBus');
const gitService = require('./gitService');
const CodeFile = require('../models/CodeFile');
const terminalService = require('./terminalService');
const containerWorker = require('./containerWorker');
const { execSync } = require('child_process');
const { notifyAgentEvent } = require('./notificationTriggers');

// `metadata` is a Mongoose Map: prefer .get(), but tolerate plain objects too.
function metaValue(execution, key) {
  const meta = execution?.metadata;
  if (!meta) return undefined;
  if (typeof meta.get === 'function') return meta.get(key);
  return meta[key];
}

class AgentSocketHandler {
  constructor(io) {
    this.io = io;
    this.executions = new Map();
    this.setupAgentNamespace();
  }

  setupAgentNamespace() {
    const agentNamespace = this.io.of('/agent');

    agentNamespace.use(async (socket, next) => {
      try {
        const { userId, decoded } = await resolveSocketUser(socket);
        socket.userId = userId;
        socket.user = decoded;
        next();
      } catch (error) {
        next(error);
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

  async handleDelegate(socket, data = {}) {
    const { taskId, taskTitle, sessionId, workspaceId, summary = '', specId, provider = 'gemini', localPrivacyMode = false } = data;

    try {
      // Access checks BEFORE any mutation (execution creation, task updates):
      // a client-supplied taskId/specId/workspaceId must belong to the caller.
      if (taskId) {
        const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
        if (!task) {
          return socket.emit('agent:error', { message: 'Task not found' });
        }
      }
      if (specId) {
        const spec = await SpecModel.findById(specId);
        if (!spec || !await userCanAccessSpec(spec, socket.userId)) {
          return socket.emit('agent:error', { message: 'Spec not found or project access denied' });
        }
      }
      if (workspaceId && !await userCanAccessWorkspace(workspaceId, socket.userId)) {
        return socket.emit('agent:error', { message: 'Workspace access denied' });
      }

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

      // Create the isolated agent branch so every execution has a real base to
      // merge back into. Without a workspace there is nowhere to branch.
      if (workspaceId) {
        try {
          const slug = String(taskTitle || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
          const agentBranch = `feature/${execution._id}-${slug}`;
          await gitService.init(workspaceId);
          await gitService.ensureBaseCommit(workspaceId, 'main');
          const branchResult = await gitService.createBranch(workspaceId, agentBranch);
          if (branchResult.success) {
            execution.branch = agentBranch;
            execution.baseBranch = 'main';
            if (typeof execution.metadata?.set === 'function') execution.metadata.set('agentBranch', agentBranch);
            await execution.save();
          } else {
            console.error('Agent branch creation failed:', branchResult.error);
          }
        } catch (error) {
          console.error('Agent branch setup error:', error.message);
        }
      }

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
      // Spec content is fed to the model below, so never read one the socket
      // user cannot reach.
      if (spec && !await userCanAccessSpec(spec, socket.userId)) {
        return socket.emit('agent:error', { message: 'Spec not found or project access denied' });
      }

      const codeFiles = workspaceId
        ? await CodeFile.find({ company: workspaceId }).select('path name language content').lean()
        : [];

      const messages = [
        { role: 'system', content: `You are an autonomous AI agent executing a task. Task: ${execution.taskTitle}\n\n${agentChangeSet.CHANGE_FORMAT_INSTRUCTIONS}` },
      ];
      if (spec && spec.content) {
        messages.push({ role: 'system', content: `Spec contract: ${spec.content}` });
      }
      if (task && task.description) {
        messages.push({ role: 'user', content: task.description });
      }

      const codeContext = {
        workspaceId,
        files: codeFiles,
        agentMode: true,
        instructions: spec ? `Follow the spec contract: ${spec.specId}` : undefined,
      };

      const result = await aiRouterService.routeChat(messages, codeContext, { provider, localPrivacyMode });

      if (result.success) {
        // Stage the proposal on the isolated agent branch; VFS stays untouched
        // until the user approves.
        const changes = agentChangeSet.buildChangeset(result.content || '', codeFiles);
        const { filesChanged, diffSummary } = agentChangeSet.summarize(changes, codeFiles);
        if (changes.length && workspaceId) {
          await agentChangeSet.stageChanges(workspaceId, changes, {
            message: `Agent: ${execution.taskTitle}`.slice(0, 200),
            branch: metaValue(execution, 'agentBranch') || execution.branch,
          }).catch((error) => console.error('Agent stage error:', error));
        }

        execution.status = 'awaiting_approval';
        execution.logs.push({ timestamp: new Date(), message: `Agent completed execution (${changes.length} file(s) staged), awaiting approval` });
        execution.filesChanged = filesChanged;
        execution.proposedChanges = changes.map((change) => ({
          path: change.path,
          action: change.action,
          language: change.language,
          content: change.content,
        }));
        execution.diffSummary = diffSummary;

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

        notifyAgentEvent({
          type: 'agent_needs_input',
          execution,
          userId: socket.userId,
          detail: 'The agent finished and is waiting for your approval before applying changes.',
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
        notifyAgentEvent({
          type: 'agent_failed',
          execution,
          userId: socket.userId,
          detail: String(result.error || 'The agent run failed').slice(0, 200),
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

  async handleCancel(socket, data = {}) {
    const { executionId } = data;
    if (!executionId) {
      return socket.emit('agent:error', { message: 'executionId required' });
    }
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

  async handleApprove(socket, data = {}) {
    const { executionId, taskId } = data;
    if (!executionId) {
      return socket.emit('agent:error', { message: 'executionId required' });
    }
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    // The taskId is client-supplied — only allow it to move the caller's own task.
    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
      await LocalTask.findByIdAndUpdate(taskId, {
        status: 'completed',
        completedAt: new Date(),
        'agentExecution.status': 'completed',
        updatedAt: new Date(),
      });
    }

    execution.status = 'completed';
    execution.approvalRequired = false;
    // Apply the staged proposal to the VFS only now that a human approved it.
    const applied = await agentChangeSet.applyExecutionChanges(execution);
    execution.logs.push({
      timestamp: new Date(),
      message: applied.applied
        ? `Agent changes approved and merged (${applied.applied} file(s) applied)`
        : 'Agent changes approved and merged',
    });
    await execution.save();

    const agentBranch = metaValue(execution, 'agentBranch') || execution.branch;
    const workspaceId = metaValue(execution, 'workspaceId');
    if (agentBranch) {
      try {
        await gitService.merge(workspaceId || 'default', agentBranch);
      } catch (error) {
        console.error('Git merge error:', error);
        execution.logs.push({ timestamp: new Date(), message: `Merge warning: ${error.message}` });
        await execution.save();
      }
    }

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

  async handleReject(socket, data = {}) {
    const { executionId, taskId } = data;
    if (!executionId) {
      return socket.emit('agent:error', { message: 'executionId required' });
    }
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    // Client-supplied taskId must belong to the caller.
    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
      await LocalTask.findByIdAndUpdate(taskId, {
        status: 'in-progress',
        'agentExecution.status': 'rejected',
        updatedAt: new Date(),
      });
    }

    execution.status = 'rejected';
    execution.approvalRequired = false;
    execution.proposedChanges = [];
    execution.filesChanged = [];
    execution.logs.push({ timestamp: new Date(), message: 'Agent work rejected and task rolled back' });
    await execution.save();

    const agentBranch = metaValue(execution, 'agentBranch') || execution.branch;
    const workspaceId = metaValue(execution, 'workspaceId');
    if (agentBranch) {
      try {
        await gitService.reset(workspaceId || 'default', [agentBranch]);
      } catch (error) {
        console.error('Git reset error:', error);
      }
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

  async handleTweak(socket, data = {}) {
    const { executionId, taskId, feedback } = data;
    if (!executionId) {
      return socket.emit('agent:error', { message: 'executionId required' });
    }
    const execution = await AgentExecution.findById(executionId);

    if (!execution || execution.userId !== socket.userId) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
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

  async handleGetStatus(socket, data = {}) {
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

  async handleVerifySpec(socket, data = {}) {
    const { specId, taskId } = data;
    if (!specId) {
      return socket.emit('agent:error', { message: 'specId required' });
    }
    try {
      // verifySpec() loads AND saves the spec (writes validation results) and
      // can write to the task — both must belong to the caller first.
      const spec = await SpecModel.findById(specId);
      if (!spec || !await userCanAccessSpec(spec, socket.userId)) {
        return socket.emit('agent:error', { message: 'Spec not found or project access denied' });
      }
      if (taskId) {
        const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
        if (!task) {
          return socket.emit('agent:error', { message: 'Task not found' });
        }
      }
      const result = await sddVerificationService.verifySpec(specId, taskId);
      socket.emit('agent:spec-verification', result);
    } catch (error) {
      socket.emit('agent:error', { message: error.message });
    }
  }
}

module.exports = AgentSocketHandler;