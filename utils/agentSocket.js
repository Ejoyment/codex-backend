const { resolveSocketUser } = require('./socketAuth');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const LocalProject = require('../models/LocalProject');
const SpecModel = require('../models/SpecModel');
const { userCanAccessProject, userCanAccessSpec } = require('./specAccess');
const { assertWorkspaceAccess } = require('./workspaceAuth');
const aiRouterService = require('./aiRouterService');
const sddVerificationService = require('./sddVerificationService');
const agentChangeSet = require('./agentChangeSet');
const agentRunner = require('./agentRunner');
const agentApprovalService = require('./agentApprovalService');
const realtimeBus = require('./realtimeBus');
const gitService = require('./gitService');
const CodeFile = require('../models/CodeFile');
const terminalService = require('./terminalService');
const containerWorker = require('./containerWorker');
const { execSync } = require('child_process');
const { notifyAgentEvent } = require('./notificationTriggers');
const CreditPoolService = require('./creditPoolService');
const { trimToLast, MAX_TWEAKS } = require('./retention');
const { resolveProjectId, projectFileQuery } = require('./fileScope');

// `metadata` is a Mongoose Map: prefer .get(), but tolerate plain objects too.
function metaValue(execution, key) {
  const meta = execution?.metadata;
  if (!meta) return undefined;
  if (typeof meta.get === 'function') return meta.get(key);
  return meta[key];
}

function setMetaValue(execution, key, value) {
  const meta = execution?.metadata;
  if (!meta) {
    execution.metadata = { [key]: value };
    return;
  }
  if (typeof meta.set === 'function') meta.set(key, value);
  else meta[key] = value;
}

function extractPlanText(content) {
  const text = String(content || '').trim();
  if (!text) return '';
  const match = text.match(/(?:^|\n)(?:#{1,4}\s*)?(?:implementation\s+)?plan\b[\s\S]*/i);
  return (match ? match[0] : text).slice(0, 8000).trim();
}

// Re-check the execution's stored workspace at approval time. Membership can
// change between delegation and approval, and older rows may store a personal
// user id instead of the canonical Company id.
async function resolveExecutionWorkspace(socket, execution) {
  const stored = metaValue(execution, 'workspaceId');
  if (!stored) return { ok: true, workspaceId: null };
  const access = await assertWorkspaceAccess(stored, socket.userId);
  if (!access.ok) return { ok: false, reason: access.reason };
  if (String(stored) !== access.workspaceId) {
    setMetaValue(execution, 'workspaceId', access.workspaceId);
  }
  return { ok: true, workspaceId: access.workspaceId };
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
          if (String(execution.userId) === String(socket.userId) && execution.status === 'running') {
            execution.status = 'failed';
            execution.logs.push({ timestamp: new Date(), message: 'Connection lost - execution paused' });
            this.executions.set(executionId, execution);
          }
        }
      });
    });
  }

  async handleDelegate(socket, data = {}) {
    const { taskId, taskTitle, sessionId, workspaceId, summary = '', specId, provider: requestedProvider, model, localPrivacyMode = false } = data;
    let creditCharged = false;
    let agentWorktree = null;
    let createdExecution = null;
    const refundCredit = async () => {
      if (!creditCharged) return;
      creditCharged = false;
      try {
        await CreditPoolService.refundCredits(socket.userId, CreditPoolService.AGENT_JOB_CREDIT_COST);
      } catch (error) {
        console.error('Agent credit refund error:', error.message);
      }
    };

    try {
      const { provider, localPrivacyMode: effectiveLocalPrivacyMode } =
        aiRouterService.resolveRequestProvider(requestedProvider, localPrivacyMode);
      const effectiveModel = aiRouterService.normalizeModel(provider, model);
      await aiRouterService.validateModel(provider, effectiveModel);
      // Access checks BEFORE any mutation (execution creation, task updates):
      // a client-supplied taskId/specId/workspaceId must belong to the caller.
      let task = null;
      if (taskId) {
        task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
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

      let project = null;
      if (task?.projectId) {
        project = await LocalProject.findById(task.projectId).select('workspaceId').lean();
        if (!project) {
          return socket.emit('agent:error', { message: 'Project not found' });
        }
        if (!await userCanAccessProject(task.projectId, socket.userId)) {
          return socket.emit('agent:error', { message: 'Project access denied' });
        }
      }

      const requestedWorkspaceId = workspaceId || task?.companyId || project?.workspaceId || null;
      let canonicalWorkspaceId = null;
      if (requestedWorkspaceId) {
        const access = await assertWorkspaceAccess(requestedWorkspaceId, socket.userId);
        if (!access.ok) {
          return socket.emit('agent:error', { message: 'Workspace access denied' });
        }
        canonicalWorkspaceId = access.workspaceId;
      }
      if (task?.companyId && String(task.companyId) !== canonicalWorkspaceId) {
        return socket.emit('agent:error', { message: 'Task does not belong to this workspace' });
      }
      if (project?.workspaceId && String(project.workspaceId) !== canonicalWorkspaceId) {
        return socket.emit('agent:error', { message: 'Project does not belong to this workspace' });
      }
      const taskProjectId = resolveProjectId({ task });

      const credit = await CreditPoolService.deductCredits(socket.userId, CreditPoolService.AGENT_JOB_CREDIT_COST);
      if (!credit.success) {
        return socket.emit('agent:error', {
          message: credit.message || 'Insufficient AI credits',
          code: 'CREDIT_LIMIT_REACHED',
          requiresUpgrade: true,
          remaining: credit.remaining,
        });
      }
      creditCharged = true;

      const execution = await AgentExecution.create({
        userId: socket.userId,
        sessionId: sessionId || 'standalone-task',
        taskId: task?._id || null,
        projectId: taskProjectId,
        taskTitle: taskTitle || 'Agent task',
        summary,
        status: 'running',
        model: effectiveModel || provider,
        approvalRequired: true,
        metadata: {
          taskId: taskId || null,
          workspaceId: canonicalWorkspaceId || null,
          projectId: taskProjectId,
          specId: specId || null,
          source: 'agent:delegate',
          provider,
          model: effectiveModel || null,
          localPrivacyMode: effectiveLocalPrivacyMode,
          creditsCharged: CreditPoolService.AGENT_JOB_CREDIT_COST,
        },
      });
      createdExecution = execution;

      // Create the isolated agent branch so every execution has a real base to
      // merge back into. Without a workspace there is nowhere to branch.
      if (canonicalWorkspaceId) {
        try {
          const slug = String(taskTitle || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
          const agentBranch = `feature/${execution._id}-${slug}`;
          await gitService.init(canonicalWorkspaceId, {}, taskProjectId);
          const branchResult = await gitService.createAgentWorktree(
            canonicalWorkspaceId,
            agentBranch,
            'main',
            taskProjectId,
            execution._id.toString()
          );
          if (branchResult.success) {
            agentWorktree = {
              workspaceId: canonicalWorkspaceId,
              projectId: taskProjectId,
              executionId: execution._id.toString(),
            };
            execution.branch = agentBranch;
            execution.baseBranch = 'main';
            if (typeof execution.metadata?.set === 'function') execution.metadata.set('agentBranch', agentBranch);
            await execution.save();
          } else {
            throw new Error(`Could not create isolated branch: ${branchResult.error}`);
          }
        } catch (error) {
          throw new Error(`Agent branch setup failed: ${error.message}`);
        }
      }

      if (taskId) {
        await LocalTask.findOneAndUpdate({ _id: taskId, userId: socket.userId }, {
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
        localPrivacyMode: effectiveLocalPrivacyMode,
      });

      socket.join(`task:${taskId}`);
      socket.join(`task:${taskId}:logs`);

      socket.emit('agent:delegate-result', {
        success: true,
        execution,
        taskId,
      });

      this.executionLoop(execution, taskId, canonicalWorkspaceId, specId, provider, effectiveModel, effectiveLocalPrivacyMode, socket, refundCredit);

      // Provision container worker if Docker is available
      if (canonicalWorkspaceId) {
        try {
          const containerResult = await containerWorker.provisionWorker(
            taskId,
            socket.userId,
            canonicalWorkspaceId,
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
      if (agentWorktree) {
        const cleanup = await gitService.removeAgentWorktree(
          agentWorktree.workspaceId,
          agentWorktree.projectId,
          agentWorktree.executionId
        );
        if (!cleanup.success) console.error('[agent-socket] worktree cleanup failed:', cleanup.error);
      }
      if (createdExecution) {
        createdExecution.status = 'failed';
        createdExecution.summary = error.message || 'Agent branch setup failed';
        createdExecution.completedAt = new Date();
        await createdExecution.save();
      }
      await refundCredit();
      console.error('Agent delegate error:', error);
      socket.emit('agent:error', { message: error.message });
    }
  }

  async syncTaskExecution(taskId, userId, status, { error = '', message = '' } = {}) {
    if (!taskId) return;
    try {
      const update = {
        'agentExecution.status': status,
        'agentExecution.error': error,
        updatedAt: new Date(),
      };
      if (message) {
        update.$push = { 'agentExecution.logs': { timestamp: new Date(), message } };
      }
      await LocalTask.findOneAndUpdate({ _id: taskId, userId }, update);
    } catch (taskError) {
      console.error('Agent task status sync error:', taskError.message);
    }
  }

  async executionLoop(execution, taskId, workspaceId, specId, provider, model, localPrivacyMode, socket, refundCredit = async () => {}, options = {}) {
    const priorAttempt = {
      status: execution.status,
      error: execution.status === 'failed' ? execution.summary : '',
      summary: execution.summary,
      filesChanged: execution.filesChanged,
      logs: execution.logs,
    };
    const hasPriorAttempt = Boolean(options.feedback)
      || (execution.retryCount || 0) > 0
      || (execution.tweaks || []).length > 0
      || execution.status === 'failed'
      || (execution.logs || []).some((entry) => /error|fail/i.test(String(entry?.message || '')));
    try {
      execution.status = 'running';
      if (!options.keepLogs) {
        execution.logs = [{ timestamp: new Date(), message: 'Agent execution started' }];
      } else if (options.feedback) {
        execution.logs.push({ timestamp: new Date(), message: `Re-running agent with feedback: ${options.feedback}` });
      }
      await execution.save();

      const task = taskId ? await LocalTask.findById(taskId) : null;
      const requestedSpecIds = [...new Set([
        ...(options.specIds || []),
        ...(specId ? [String(specId)] : []),
        ...(metaValue(execution, 'specIds') || []),
      ])];
      const specs = [];
      for (const id of requestedSpecIds) {
        const spec = await SpecModel.findById(id);
        // Spec content is fed to the model below, so never read one the socket
        // user cannot reach.
        if (spec && await userCanAccessSpec(spec, socket.userId)) specs.push(spec);
      }
      if (specId && !specs.length) {
        await refundCredit();
        return socket.emit('agent:error', { message: 'Spec not found or project access denied' });
      }

      let project = null;
      const projectId = resolveProjectId({
        projectId: metaValue(execution, 'projectId') || null,
        task,
        execution,
      });
      if (projectId) {
        project = await LocalProject.findById(projectId).lean();
      }

      const snapshotFiles = execution.contextSnapshot?.codebaseSnapshot?.files || [];
      const codeFiles = workspaceId
        ? await CodeFile.find(projectFileQuery(workspaceId, projectId)).select('path name language content').lean()
        : snapshotFiles;

      let contextSummary = '';
      const contextBundle = execution.contextSnapshot?.contextBundle;
      if (contextBundle) {
        try {
          const agentContextService = require('./agentContextService');
          contextSummary = agentContextService.toPromptSummary(contextBundle);
        } catch (error) {
          console.error('Agent context summary error:', error.message);
        }
      }

      const taskDetails = task ? task.toObject() : { title: execution.taskTitle, description: '' };
      if (options.feedback) {
        taskDetails.description = [taskDetails.description, `Follow-up instruction: ${options.feedback}`]
          .filter(Boolean)
          .join('\n');
      }

      const { messages, codeContext } = agentRunner.buildAgentContext({
        task: taskDetails,
        taskTitle: execution.taskTitle,
        project,
        specs,
        codeFiles,
        contextSummary,
        priorAttempt: hasPriorAttempt ? priorAttempt : null,
        branch: metaValue(execution, 'agentBranch') || execution.branch,
        baseBranch: execution.baseBranch,
        workspaceId,
        provider,
        model,
      });

      const emitProgress = (message) => {
        realtimeBus.emitAgentProgress(socket.userId, {
          type: 'progress',
          executionId: execution._id,
          status: 'running',
          message,
        });
        socket.emit('agent:progress', { executionId: execution._id, status: 'running', message });
      };
      emitProgress(`Assembling context (${codeContext.files.length} relevant file(s), ${codeContext.fileManifest.total} in manifest)...`);

      const result = await agentRunner.requestChangeSet({
        messages,
        codeContext,
        codeFiles,
        provider,
        model,
        localPrivacyMode,
        onAttempt: ({ attempt, maxAttempts }) => emitProgress(
          attempt === 1
            ? 'Agent is generating the implementation...'
            : `Agent response had no applicable changes; retrying (${attempt}/${maxAttempts})...`
        ),
      });

      if (!result.success) {
        throw new Error(result.error || 'Agent execution failed without an error message');
      }

      if (result.planOnly) {
        // Prose-only answers stay reviewable: the user can accept the plan,
        // continue the run with feedback, or delegate the task again.
        execution.status = 'awaiting_approval';
        execution.summary = result.content || 'The agent returned a plan without file changes.';
        execution.plan = extractPlanText(result.content);
        execution.filesChanged = [];
        execution.proposedChanges = [];
        execution.diffSummary = { filesChanged: 0, insertions: 0, deletions: 0 };
        execution.validationResult = {
          specs: [],
          command: { status: 'skipped', reason: 'No file changes were proposed; nothing to verify.' },
        };
        setMetaValue(execution, 'planOnly', true);
        setMetaValue(execution, 'attemptsUsed', result.attemptsUsed);
        execution.logs.push({
          timestamp: new Date(),
          message: `Agent returned a reviewable plan without file changes after ${result.attemptsUsed} attempt(s). Review it, continue with feedback, or delegate again.`,
        });
        await execution.save();
        await this.syncTaskExecution(taskId, socket.userId, 'awaiting_approval', {
          message: 'Agent returned a plan without file changes; review the run or continue with feedback',
        });

        realtimeBus.emitAgentProgress(socket.userId, {
          type: 'complete',
          executionId: execution._id,
          status: 'awaiting_approval',
          planOnly: true,
          result,
        });
        socket.emit('agent:execution-complete', {
          execution,
          result,
          status: 'awaiting_approval',
          planOnly: true,
        });
        notifyAgentEvent({
          type: 'agent_needs_input',
          execution,
          userId: socket.userId,
          detail: 'The agent returned a plan without file changes. Review it or continue the run with feedback.',
        });
        return;
      }

      // Stage the proposal on the isolated agent branch; VFS stays untouched
      // until the user approves.
      const changes = result.changes;
      const { filesChanged, diffSummary } = agentChangeSet.summarize(changes, codeFiles);
      if (workspaceId) {
        const staged = await agentChangeSet.stageChanges(workspaceId, changes, {
          message: `Agent: ${execution.taskTitle}`.slice(0, 200),
          branch: metaValue(execution, 'agentBranch') || execution.branch,
          projectId,
          executionId: execution._id.toString(),
        });
        if (!staged.success || !staged.committed) {
          throw new Error(`Could not stage agent changes on branch ${metaValue(execution, 'agentBranch') || execution.branch}: ${staged.error || staged.reason || 'commit did not complete'}`);
        }
      }

      execution.status = 'awaiting_approval';
      execution.logs.push({
        timestamp: new Date(),
        message: `Agent completed execution (${changes.length} file(s) staged) after ${result.attemptsUsed} attempt(s), awaiting approval`,
      });
      execution.filesChanged = filesChanged;
      execution.proposedChanges = changes.map((change) => ({
        path: change.path,
        action: change.action,
        language: change.language,
        content: change.content,
      }));
      execution.diffSummary = diffSummary;
      execution.summary = result.content || result.summary || '';
      execution.plan = extractPlanText(result.content);
      setMetaValue(execution, 'planOnly', false);
      setMetaValue(execution, 'attemptsUsed', result.attemptsUsed);
      await execution.save();
      await this.syncTaskExecution(taskId, socket.userId, 'awaiting_approval', {
        message: `Agent staged ${changes.length} file change(s); awaiting approval`,
      });

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
    } catch (error) {
      execution.status = 'failed';
      execution.summary = error.message;
      execution.logs.push({ timestamp: new Date(), message: `Execution error: ${error.message}` });
      await refundCredit();
      await execution.save();
      await this.syncTaskExecution(taskId, socket.userId, 'failed', {
        error: error.message,
        message: `Agent failed: ${error.message}`,
      });
      realtimeBus.emitAgentProgress(socket.userId, {
        type: 'error',
        executionId: execution._id,
        status: 'failed',
        error: error.message,
      });
      socket.emit('agent:execution-error', {
        execution,
        error: error.message,
        status: 'failed',
      });
      socket.emit('agent:error', { message: error.message });
      notifyAgentEvent({
        type: 'agent_failed',
        execution,
        userId: socket.userId,
        detail: String(error.message || 'The agent run failed').slice(0, 200),
      });
    }
  }

  async handleCancel(socket, data = {}) {
    const { executionId } = data;
    if (!executionId) {
      return socket.emit('agent:error', { message: 'executionId required' });
    }
    const execution = await AgentExecution.findById(executionId);

    if (!execution || String(execution.userId) !== String(socket.userId)) {
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

    if (!execution || String(execution.userId) !== String(socket.userId)) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    const workspaceAccess = await resolveExecutionWorkspace(socket, execution);
    if (!workspaceAccess.ok) {
      return socket.emit('agent:error', { message: workspaceAccess.reason || 'Workspace access denied' });
    }

    // The taskId is client-supplied — only allow it to move the caller's own task.
    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
    }

    const result = await agentApprovalService.approveExecution({
      execution,
      userId: socket.userId,
      taskId,
      workspaceId: workspaceAccess.workspaceId,
      source: 'socket',
      requireWorkspace: false,
      requireChanges: false,
    });
    if (!result.ok) {
      return socket.emit('agent:error', { message: result.message });
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

    if (!execution || String(execution.userId) !== String(socket.userId)) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    const workspaceAccess = await resolveExecutionWorkspace(socket, execution);
    if (!workspaceAccess.ok) {
      return socket.emit('agent:error', { message: workspaceAccess.reason || 'Workspace access denied' });
    }

    // Client-supplied taskId must belong to the caller.
    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
    }

    await agentApprovalService.rejectExecution({
      execution,
      userId: socket.userId,
      taskId,
      workspaceId: workspaceAccess.workspaceId,
      reason: data.reason || '',
      source: 'socket',
    });

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

    if (!execution || String(execution.userId) !== String(socket.userId)) {
      return socket.emit('agent:error', { message: 'Execution not found' });
    }

    const workspaceAccess = await resolveExecutionWorkspace(socket, execution);
    if (!workspaceAccess.ok) {
      return socket.emit('agent:error', { message: workspaceAccess.reason || 'Workspace access denied' });
    }

    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: socket.userId });
      if (!task) {
        return socket.emit('agent:error', { message: 'Task not found' });
      }
    }

    const credit = await CreditPoolService.deductCredits(socket.userId, CreditPoolService.AGENT_JOB_CREDIT_COST);
    if (!credit.success) {
      return socket.emit('agent:error', {
        message: credit.message || 'Insufficient AI credits',
        code: 'CREDIT_LIMIT_REACHED',
        requiresUpgrade: true,
        remaining: credit.remaining,
      });
    }
    let creditCharged = true;
    const refundCredit = async () => {
      if (!creditCharged) return;
      creditCharged = false;
      await CreditPoolService.refundCredits(socket.userId, CreditPoolService.AGENT_JOB_CREDIT_COST).catch((error) => {
        console.error('Agent tweak credit refund error:', error.message);
      });
    };

    try {
      const provider = metaValue(execution, 'provider') || 'gemini';
      const model = aiRouterService.normalizeModel(provider, metaValue(execution, 'model') || execution.model || null);
      await aiRouterService.validateModel(provider, model);

      // Re-run through the shared context/retry pipeline so a follow-up keeps
      // the task brief, repository manifest, specs, and prior attempt instead
      // of starting from the feedback text alone.
      if (feedback) {
        execution.tweaks.push({ instruction: feedback, addedAt: new Date() });
        trimToLast(execution.tweaks, MAX_TWEAKS);
      }
      execution.retryCount = (execution.retryCount || 0) + 1;
      await this.executionLoop(
        execution,
        taskId || execution.taskId?.toString(),
        workspaceAccess.workspaceId,
        metaValue(execution, 'specId') || null,
        provider,
        model,
        metaValue(execution, 'localPrivacyMode') || false,
        socket,
        refundCredit,
        {
          feedback,
          keepLogs: true,
          specIds: metaValue(execution, 'specIds') || [],
        }
      );

      if (execution.status !== 'failed') {
        socket.emit('agent:tweak-result', { execution });
      }
    } catch (error) {
      await refundCredit();
      socket.emit('agent:error', { message: error.message });
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