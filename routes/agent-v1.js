const { sendInternalError } = require('../utils/httpErrors');
const express = require('express');
const { trimToLast, MAX_TWEAKS, MAX_AGENT_LOG } = require('../utils/retention');
const { agentDelegateLimiter } = require('../middleware/rateLimits');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { enforceConcurrentJobs, enforceTaskTimeout, enforceCreditPool, enforceCloudComputeLimit } = require('../middleware/tierEnforcement');
const CreditPoolService = require('../utils/creditPoolService');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const LocalProject = require('../models/LocalProject');
const SpecModel = require('../models/SpecModel');
const CodeFile = require('../models/CodeFile');
const gitService = require('../utils/gitService');
const agentChangeSet = require('../utils/agentChangeSet');
const agentApprovalService = require('../utils/agentApprovalService');
const sddVerificationService = require('../utils/sddVerificationService');
const { userCanAccessProject, userCanAccessSpec, resolveAccessibleSpecs } = require('../utils/specAccess');
const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const realtimeBus = require('../utils/realtimeBus');
const { Worker } = require('worker_threads');
const path = require('path');
const aiRouterService = require('../utils/aiRouterService');
const { projectFileQuery, resolveProjectId } = require('../utils/fileScope');

// Delegate is the expensive cloud AI path: one pool credit per job. Failed
// jobs refund below so only executions that actually ran consume budget.
const AGENT_JOB_CREDIT_COST = CreditPoolService.AGENT_JOB_CREDIT_COST;

function refundAgentCredit(userId) {
  return CreditPoolService.refundCredits(userId, AGENT_JOB_CREDIT_COST).catch((err) => {
    console.error('Agent credit refund error:', err.message);
  });
}

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

// Approve/reject/tweak re-check the workspace stored on the execution because
// membership can change after delegation. Legacy rows may also hold the
// caller's user id; access resolution stores the canonical Company id.
async function resolveExecutionWorkspace(execution, userId) {
  const stored = metaValue(execution, 'workspaceId');
  if (!stored) return { ok: true, workspaceId: null };
  const access = await assertWorkspaceAccess(stored, userId);
  if (!access.ok) return { ok: false, reason: access.reason };
  if (String(stored) !== access.workspaceId) {
    setMetaValue(execution, 'workspaceId', access.workspaceId);
  }
  return { ok: true, workspaceId: access.workspaceId };
}

function spawnAgentWorker(executionId, taskId, workspaceId, projectId, specIds, provider, model, localPrivacyMode, timeoutMs = 900000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const workerPath = path.join(__dirname, '../utils/agentWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { executionId, taskId, workspaceId, projectId: projectId || null, specIds, provider, model, localPrivacyMode },
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        worker.terminate();
      } catch (e) {}
      AgentExecution.findByIdAndUpdate(executionId, {
        status: 'failed',
        summary: `Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes`,
        completedAt: new Date(),
        $push: {
          logs: { timestamp: new Date(), message: `Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes` },
          terminalLog: { timestamp: new Date(), type: 'error', message: `Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes` },
        },
      }).catch((error) => console.error('[agent] could not persist timeout state:', error.message));
      if (taskId) {
        LocalTask.findByIdAndUpdate(taskId, {
          'agentExecution.status': 'failed',
          'agentExecution.error': `Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes`,
          $push: { 'agentExecution.logs': { timestamp: new Date(), message: `Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes` } },
          updatedAt: new Date(),
        }).catch((error) => console.error('[agent] could not persist task timeout state:', error.message));
      }
      reject(new Error(`Agent execution timed out after ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
    };

    worker.on('message', (msg) => {
      if (settled) return;
      if (msg.type === 'progress') {
        realtimeBus.emitAgentProgress(executionId, msg.payload);
        AgentExecution.findByIdAndUpdate(executionId, {
          $push: { terminalLog: { timestamp: new Date(), type: msg.payload.phase || 'progress', message: msg.payload.message || msg.payload.status || 'Agent progress' } },
        }).catch((error) => console.error('[agent] could not persist progress:', error.message));
      } else if (msg.type === 'complete') {
        settled = true;
        cleanup();
        resolve(msg.result);
      } else if (msg.type === 'error') {
        settled = true;
        cleanup();
        reject(new Error(msg.error));
      }
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate().catch((terminateError) => console.error('[agent] worker cleanup failed:', terminateError.message));
      reject(err);
    });
    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Agent worker exited before reporting completion (code ${code})`));
    });
  });
}

router.post('/delegate', agentDelegateLimiter, authenticateToken, enforceConcurrentJobs(), enforceTaskTimeout(), enforceCreditPool(), enforceCloudComputeLimit(), async (req, res) => {
  let creditCharged = false;
  let agentWorktree = null;
  let taskClaim = null;
  let execution = null;
  let workerStarted = false;
  try {
    const { taskId, taskTitle, sessionId, summary = '', provider: requestedProvider, model, localPrivacyMode: requestedLocalPrivacyMode = false } = req.body;
    let provider;
    let localPrivacyMode;
    let effectiveModel;
    try {
      const routing = aiRouterService.resolveRequestProvider(requestedProvider, requestedLocalPrivacyMode);
      provider = routing.provider;
      localPrivacyMode = routing.localPrivacyMode;
      effectiveModel = aiRouterService.normalizeModel(provider, model);
      await aiRouterService.validateModel(provider, effectiveModel);
    } catch (error) {
      return res.status(503).json({ success: false, message: error.message });
    }

    if (!taskId && !taskTitle) {
      return res.status(400).json({ success: false, message: 'taskId or taskTitle is required' });
    }

    const { tier } = req.subscription;
    if (tier === 'developer' && !aiRouterService.isLocalProvider(provider)) {
      return res.status(403).json({ success: false, message: 'Agent delegation requires Pro tier or higher. Use local BYOM.', requiresUpgrade: true });
    }

    let task = null;
    if (taskId) {
      task = await LocalTask.findOne({ _id: taskId, userId: req.userId });
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
      if (task.agentSessionId) {
        const activeExecution = await AgentExecution.findOne({
          _id: task.agentSessionId,
          status: { $in: ['queued', 'running', 'awaiting_review', 'awaiting_approval', 'approving'] },
        }).select('_id');
        if (activeExecution) return res.status(409).json({ success: false, message: 'This task already has an active agent session' });
      }
      if (task.status === 'blocked') return res.status(409).json({ success: false, message: 'Blocked tasks cannot be delegated' });
      const unresolvedBlockers = await LocalTask.countDocuments({
        _id: { $in: task.blockedBy || [] },
        userId: req.userId,
        status: { $nin: ['done', 'completed', 'archived'] },
      });
      if (unresolvedBlockers) return res.status(409).json({ success: false, message: 'Resolve blocking tasks before delegation' });
    }

    const taskProjectId = resolveProjectId({ task });
    let taskProject = null;
    if (taskProjectId) {
      taskProject = await LocalProject.findById(taskProjectId).select('workspaceId').lean();
      if (!taskProject) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }
      if (!(await userCanAccessProject(taskProjectId, req.userId))) {
        return res.status(403).json({ success: false, message: 'Project access denied' });
      }
    }
    let requestedWorkspaceId = req.body.workspaceId
      || task?.companyId?.toString()
      || taskProject?.workspaceId?.toString();
    if (!requestedWorkspaceId) {
      requestedWorkspaceId = String((await ensurePersonalWorkspace(req.userId))._id);
      if (taskProjectId) {
        await LocalProject.updateOne(
          { _id: taskProjectId, $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }] },
          { $set: { workspaceId: requestedWorkspaceId } }
        );
      }
    }
    const workspaceAccess = await assertWorkspaceAccess(requestedWorkspaceId, req.userId);
    if (!workspaceAccess.ok) {
      return res.status(403).json({ success: false, message: workspaceAccess.reason || 'Workspace access denied' });
    }
    const workspaceId = workspaceAccess.workspaceId;
    if (task?.companyId && String(task.companyId) !== workspaceId) {
      return res.status(403).json({ success: false, message: 'Task is linked to a different workspace' });
    }
    if (taskProject?.workspaceId && String(taskProject.workspaceId) !== workspaceId) {
      return res.status(403).json({ success: false, message: 'Project does not belong to this workspace' });
    }

    const requestedSpecIds = [...new Set([...(req.body.specIds || []), ...(req.body.specId ? [req.body.specId] : []), ...(task?.specIds || []).map(String)])];
    // Specs belong to the task's project; the workspace check above only gates
    // the git branch, not which specs may be attached.
    const resolvedSpecs = await resolveAccessibleSpecs(requestedSpecIds, { projectId: task?.projectId || null, userId: req.userId });
    if (!resolvedSpecs.ok) {
      return res.status(400).json({ success: false, message: resolvedSpecs.message });
    }
    const specs = resolvedSpecs.specs.map((spec) => (typeof spec.toObject === 'function' ? spec.toObject() : spec));
    // Only the task's own project is readable by the agent. A delegated task
    // must never see another project's source just because both live in the
    // same workspace; unlinked tasks see only unassigned files.
    const codeFiles = await CodeFile.find(projectFileQuery(workspaceId, taskProjectId)).select('path name language content').lean();
    const taskTitleValue = taskTitle || task?.title || 'Workspace task';
    const slug = taskTitleValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
    // Re-delegating a failed task must not collide with the branch left behind
    // by the previous run, so each execution gets a unique suffix.
    const branch = `feature/${task?._id || 'task'}-${Date.now().toString(36)}-${slug}`;
    const baseBranch = 'main';
    const executionId = new AgentExecution()._id;

    // Build comprehensive context bundle for delegated agent
    let agentContextBundle = null;
    try {
      const agentContextService = require('../utils/agentContextService');
      agentContextBundle = await agentContextService.buildBundle({
        userId: req.userId,
        companyId: workspaceId,
        workspaceId,
        taskId: task?._id?.toString(),
        projectId: task?.projectId?.toString(),
        message: summary || taskTitleValue,
        includeConversations: true,
        includeMeetings: true,
        includeFiles: true
      });
    } catch (ctxErr) {
      console.error('Failed to build agent context bundle for delegation:', ctxErr.message);
    }

    const contextSnapshot = {
      task: task ? { id: task._id.toString(), title: task.title, description: task.description, priority: task.priority, figmaNodeId: task.figmaNodeId } : { title: taskTitleValue, description: summary },
      projectId: taskProjectId,
      specs: specs.map((spec) => ({ ...spec, _id: spec._id.toString() })),
      codebaseSnapshot: { branch: baseBranch, files: codeFiles.map((file) => ({ path: file.path, name: file.name, language: file.language, content: file.content })) },
      architecturalRules: specs.flatMap((spec) => spec.architecturalRules || []),
      figmaContext: null,
      contextBundle: agentContextBundle,
      capturedAt: new Date(),
    };

    const credit = await CreditPoolService.deductCredits(req.userId, AGENT_JOB_CREDIT_COST);
    if (!credit.success) {
      return res.status(403).json({
        success: false,
        message: credit.message || 'Insufficient AI credits',
        code: 'CREDIT_LIMIT_REACHED',
        requiresUpgrade: true,
        remaining: credit.remaining,
      });
    }
    creditCharged = true;

    const branchResult = await gitService.createAgentWorktree(
      workspaceId,
      branch,
      baseBranch,
      taskProjectId,
      executionId.toString()
    );
    if (!branchResult.success) {
      throw new Error(`Could not create isolated branch: ${branchResult.error}`);
    }
    agentWorktree = { workspaceId, projectId: taskProjectId, executionId: executionId.toString() };

    execution = await AgentExecution.create({
      _id: executionId,
      userId: req.userId,
      sessionId: sessionId || null,
      taskId: task?._id || null,
      projectId: taskProjectId || null,
      taskTitle: taskTitleValue,
      summary,
      status: 'queued',
      approvalRequired: true,
      specRef: specs[0]?._id || null,
      branch,
      baseBranch,
      contextSnapshot,
      model: effectiveModel || provider,
      startedAt: new Date(),
      computeReservationHours: req.computeReservationHours || 0,
      metadata: {
        taskId: taskId || null,
        workspaceId,
        projectId: taskProjectId,
        specIds: specs.map((spec) => spec._id.toString()),
        agentBranch: branch,
        source: 'agent-v1/delegate',
        provider,
        model: effectiveModel || null,
        localPrivacyMode,
        creditsCharged: AGENT_JOB_CREDIT_COST,
      },
      logs: [{ timestamp: new Date(), message: 'Agent execution initialized' }],
    });

    if (task) {
      const previousTaskState = {
        status: task.status,
        companyId: task.companyId,
        agentSessionId: task.agentSessionId,
        branch: task.branch,
        agentExecution: task.agentExecution?.toObject?.() || task.agentExecution,
      };
      const claimedTask = await LocalTask.findOneAndUpdate(
        {
          _id: task._id,
          userId: req.userId,
          status: previousTaskState.status,
          agentSessionId: previousTaskState.agentSessionId ?? null,
        },
        {
          $set: {
            status: 'in_progress',
            companyId: workspaceId,
            agentSessionId: execution._id,
            branch,
            'agentExecution.status': 'running',
            'agentExecution.error': '',
            'agentExecution.agentBranch': branch,
            'agentExecution.specRef': specs[0]?._id || null,
            updatedAt: new Date(),
          },
          $push: {
            'agentExecution.logs': {
              timestamp: new Date(),
              message: `Agent started on branch ${branch}`,
            },
          },
        },
        { new: true }
      );

      if (!claimedTask) {
        const conflict = new Error('This task was delegated by another request. Refresh and try again.');
        conflict.status = 409;
        throw conflict;
      }

      taskClaim = {
        taskId: task._id,
        executionId: execution._id,
        userId: req.userId,
        previousTaskState,
      };
      task = claimedTask;
      try {
        const cacheInvalidator = require('../utils/cacheInvalidator');
        cacheInvalidator.invalidateForTask(taskId);
        if (workspaceId) cacheInvalidator.invalidateForCompany(workspaceId);
        if (task.userId) cacheInvalidator.invalidateForUser(task.userId);
      } catch (e) { /* ignore */ }
    }

    if (typeof req.consumeComputeReservation === 'function') req.consumeComputeReservation();

    realtimeBus.emitAgentProgress(req.userId, {
      type: 'delegate',
      executionId: execution._id,
      taskId,
      status: 'running',
      provider,
    });

    execution.status = 'running';
    execution.terminalLog.push({ timestamp: new Date(), type: 'start', message: `Started on ${branch}` });
    await execution.save();
    const workerPromise = spawnAgentWorker(
      execution._id.toString(),
      taskId,
      workspaceId,
      taskProjectId,
      specs.map((spec) => spec._id.toString()),
      provider,
      effectiveModel,
      localPrivacyMode,
      1800000 // 30 minutes
    );
    workerStarted = true;

    workerPromise.then(async (result) => {
      const planOnly = Boolean(result?.planOnly);
      execution.status = 'awaiting_review';
      execution.completedAt = new Date();
      execution.logs.push({
        timestamp: new Date(),
        message: planOnly
          ? 'Agent returned a plan without file changes, awaiting approval'
          : 'Agent execution completed, awaiting approval',
      });
      await execution.save();
      if (task) {
        await LocalTask.findOneAndUpdate({ _id: task._id, userId: req.userId, agentSessionId: execution._id }, {
          'agentExecution.status': 'awaiting_approval',
          'agentExecution.error': '',
          $push: {
            'agentExecution.logs': {
              timestamp: new Date(),
              message: planOnly
                ? 'Agent returned a plan without file changes; review it or continue with feedback'
                : 'Agent completed; changes are ready for review',
            },
          },
          updatedAt: new Date(),
        });
        try {
          const cacheInvalidator = require('../utils/cacheInvalidator');
          cacheInvalidator.invalidateForTask(task._id);
        } catch (e) { /* ignore */ }
      }
    }).catch(async (err) => {
      const failureMessage = err.message || 'Agent execution failed without an error message';
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.summary = failureMessage;
      execution.terminalLog.push({ timestamp: new Date(), type: 'error', message: failureMessage });
      execution.logs.push({ timestamp: new Date(), message: `Agent worker error: ${failureMessage}` });
      await execution.save();
      if (task) {
        await LocalTask.findOneAndUpdate({ _id: task._id, userId: req.userId, agentSessionId: execution._id }, {
          'agentExecution.status': 'failed',
          'agentExecution.error': failureMessage,
          $push: { 'agentExecution.logs': { timestamp: new Date(), message: `Agent failed: ${failureMessage}` } },
          updatedAt: new Date(),
        });
        try {
          const cacheInvalidator = require('../utils/cacheInvalidator');
          cacheInvalidator.invalidateForTask(task._id);
        } catch (e) { /* ignore */ }
      }
      if (creditCharged) {
        creditCharged = false;
        await refundAgentCredit(req.userId);
      }
    });

    res.status(202).json({
      success: true,
      message: 'Task delegated to agent execution',
      execution,
      taskId: task?.id || taskId || null,
      specIds: specs.map((spec) => spec._id.toString()),
      agentBranch: branch,
    });
  } catch (error) {
    if (taskClaim) {
      const { previousTaskState } = taskClaim;
      const restore = {
        $set: {
          status: previousTaskState.status,
          companyId: previousTaskState.companyId,
          agentSessionId: previousTaskState.agentSessionId,
          branch: previousTaskState.branch,
        },
      };
      if (previousTaskState.agentExecution === undefined) {
        restore.$unset = { agentExecution: 1 };
      } else {
        restore.$set.agentExecution = previousTaskState.agentExecution;
      }
      try {
        const released = await LocalTask.findOneAndUpdate(
          { _id: taskClaim.taskId, userId: taskClaim.userId, agentSessionId: taskClaim.executionId },
          restore
        );
        if (!released) console.warn('[agent-delegate] task claim changed before failed request cleanup');
      } catch (releaseError) {
        console.error('[agent-delegate] failed to release task claim:', releaseError.message);
      }
    }
    if (execution && !workerStarted) {
      await AgentExecution.deleteOne({ _id: execution._id, userId: req.userId }).catch((deleteError) => {
        console.error('[agent-delegate] failed to remove unstarted execution:', deleteError.message);
      });
    }
    if (agentWorktree) {
      const cleanup = await gitService.removeAgentWorktree(
        agentWorktree.workspaceId,
        agentWorktree.projectId,
        agentWorktree.executionId
      );
      if (!cleanup.success) console.error('[agent-delegate] worktree cleanup failed:', cleanup.error);
    }
    if (creditCharged) {
      creditCharged = false;
      await refundAgentCredit(req.userId);
    }
    console.error('Delegate task error:', error);
    if (error && error.status && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return sendInternalError(req, res, error);
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await AgentExecution.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, sessions });
  } catch (error) {
    return sendInternalError(req, res, error);
  }
});

router.get('/status/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const execution = await AgentExecution.findOne({ userId: req.userId, 'metadata.taskId': taskId }).sort({ createdAt: -1 }).lean();

    if (!execution) {
      return res.status(404).json({ success: false, message: 'No agent execution found for this task' });
    }

    res.json({ success: true, execution });
  } catch (error) {
    console.error('Get execution status error:', error);
    return sendInternalError(req, res, error);
  }
});

router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { executionId, taskId } = req.body;
    const execution = await AgentExecution.findOne({ _id: executionId || taskId, userId: req.userId });
    if (!execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    if (execution.status !== 'awaiting_review' && execution.status !== 'awaiting_approval') {
      return res.status(409).json({ success: false, message: 'Only sessions awaiting review can be approved' });
    }
    const workspaceAccess = await resolveExecutionWorkspace(execution, req.userId);
    if (!workspaceAccess.ok) {
      return res.status(403).json({ success: false, message: workspaceAccess.reason || 'Workspace access denied' });
    }
    const workspaceId = workspaceAccess.workspaceId;
    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: req.userId });
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const planOnly = Boolean(metaValue(execution, 'planOnly'))
      || !((execution.proposedChanges || []).length || (execution.filesChanged || []).length);
    // Run auto-validation on changes before merge. A plan-only run has nothing
    // to validate and should still be acceptable by a human.
    if (!planOnly) {
      try {
        const autoValidator = require('../utils/autoValidator');
        const autoValidation = await autoValidator.validate({ workspaceId, timeoutMs: 60000 });
        if (autoValidation && !autoValidation.success && autoValidation.errors.length > 0) {
          execution.validationResult = { ...(execution.validationResult || {}), autoValidation, ranAt: new Date() };
          await execution.save();
          return res.status(409).json({
            success: false,
            message: `Auto-validation found ${autoValidation.errors.length} error(s). Fix them or review carefully.`,
            execution,
            autoValidation,
          });
        }
      } catch (valErr) {
        console.error('Auto-validation in approve:', valErr.message);
      }
    }

    const result = await agentApprovalService.approveExecution({
      execution,
      userId: req.userId,
      taskId,
      workspaceId,
      source: 'rest',
      verifySpecs: true,
      requireChanges: !planOnly,
    });
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
        execution: result.execution,
        ...(result.sddVerification ? { sddVerification: result.sddVerification } : {}),
      });
    }
    res.json({
      success: true,
      execution: result.execution,
      message: planOnly ? 'Agent plan accepted' : 'Agent branch merged',
      sddVerification: result.sddVerification,
    });
  } catch (error) {
    console.error('Approve execution error:', error);
    return sendInternalError(req, res, error);
  }
});

router.post('/reject', authenticateToken, async (req, res) => {
  try {
    const { executionId, taskId } = req.body;
    const execution = await AgentExecution.findOne({ _id: executionId || taskId, userId: req.userId });
    if (!execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    const workspaceAccess = await resolveExecutionWorkspace(execution, req.userId);
    if (!workspaceAccess.ok) {
      return res.status(403).json({ success: false, message: workspaceAccess.reason || 'Workspace access denied' });
    }
    const workspaceId = workspaceAccess.workspaceId;
    if (taskId) {
      const ownedTask = await LocalTask.findOne({ _id: taskId, userId: req.userId });
      if (!ownedTask) return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const result = await agentApprovalService.rejectExecution({
      execution,
      userId: req.userId,
      taskId,
      workspaceId,
      reason: req.body.reason || '',
      source: 'rest',
    });
    res.json({ success: true, execution: result.execution, message: 'Agent work rejected and task rolled back' });
  } catch (error) {
    console.error('Reject execution error:', error);
    return sendInternalError(req, res, error);
  }
});

router.post('/tweak', authenticateToken, async (req, res) => {
  let creditCharged = false;
  try {
    const { executionId, instruction } = req.body;
    if (!instruction?.trim()) return res.status(400).json({ success: false, message: 'Instruction is required' });
    const execution = await AgentExecution.findOne({ _id: executionId, userId: req.userId });
    if (!execution) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!['awaiting_review', 'awaiting_approval', 'failed'].includes(execution.status)) return res.status(409).json({ success: false, message: 'Session cannot be resumed in its current state' });

    const workspaceAccess = await resolveExecutionWorkspace(execution, req.userId);
    if (!workspaceAccess.ok) {
      return res.status(403).json({ success: false, message: workspaceAccess.reason || 'Workspace access denied' });
    }
    const workspaceId = workspaceAccess.workspaceId;

    const credit = await CreditPoolService.deductCredits(req.userId, AGENT_JOB_CREDIT_COST);
    if (!credit.success) {
      return res.status(403).json({
        success: false,
        message: credit.message || 'Insufficient AI credits',
        code: 'CREDIT_LIMIT_REACHED',
        requiresUpgrade: true,
        remaining: credit.remaining,
      });
    }
    creditCharged = true;

    execution.tweaks.push({ instruction: instruction.trim(), addedAt: new Date() });
    trimToLast(execution.tweaks, MAX_TWEAKS);
    execution.retryCount = (execution.retryCount || 0) + 1;
    execution.status = 'running';
    execution.startedAt = new Date();
    execution.completedAt = null;
    execution.terminalLog.push({ timestamp: new Date(), type: 'follow_up', message: instruction.trim() });
    trimToLast(execution.terminalLog, MAX_AGENT_LOG);
    await execution.save();
    const specIds = metaValue(execution, 'specIds') || [];
    const localPrivacyMode = metaValue(execution, 'localPrivacyMode') || false;
    const provider = metaValue(execution, 'provider') || 'gemini';
    const model = aiRouterService.normalizeModel(provider, metaValue(execution, 'model') || execution.model || null);
    const targetTaskId = execution.taskId?.toString() || metaValue(execution, 'taskId') || null;
    const projectId = resolveProjectId({ execution });
    spawnAgentWorker(execution._id.toString(), targetTaskId, workspaceId, projectId, specIds, provider, model, localPrivacyMode)
      .then(async () => {
        execution.status = 'awaiting_review';
        execution.completedAt = new Date();
        await execution.save();
        if (targetTaskId) {
          await LocalTask.findOneAndUpdate({ _id: targetTaskId, userId: req.userId }, {
            'agentExecution.status': 'awaiting_approval',
            'agentExecution.error': '',
            $push: { 'agentExecution.logs': { timestamp: new Date(), message: 'Agent follow-up completed; changes are ready for review' } },
            updatedAt: new Date(),
          }).catch((error) => console.error('[agent] could not sync tweak task:', error.message));
        }
      })
      .catch(async (error) => {
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.terminalLog.push({ timestamp: new Date(), type: 'error', message: error.message });
        await execution.save();
        if (targetTaskId) {
          await LocalTask.findOneAndUpdate({ _id: targetTaskId, userId: req.userId }, {
            'agentExecution.status': 'failed',
            'agentExecution.error': error.message,
            $push: { 'agentExecution.logs': { timestamp: new Date(), message: `Agent follow-up failed: ${error.message}` } },
            updatedAt: new Date(),
          }).catch((taskError) => console.error('[agent] could not sync tweak failure:', taskError.message));
        }
        if (creditCharged) {
          creditCharged = false;
          await refundAgentCredit(req.userId);
        }
      });
    res.json({ success: true, execution });
  } catch (error) {
    if (creditCharged) {
      creditCharged = false;
      await refundAgentCredit(req.userId);
    }
    return sendInternalError(req, res, error);
  }
});

router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { executionId, taskId, specId } = req.body;
    const execution = await AgentExecution.findOne({ _id: executionId || taskId, userId: req.userId });
    const spec = specId ? await SpecModel.findById(specId) : (execution?.specRef ? await SpecModel.findById(execution.specRef) : null);

    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
    }

    if (!await userCanAccessSpec(spec, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
    }

    if (taskId) {
      const task = await LocalTask.findOne({ _id: taskId, userId: req.userId });
      if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
      }
    }

    const result = await sddVerificationService.verifySpec(spec._id, taskId);
    res.json({ success: true, verification: result });
  } catch (error) {
    console.error('Verify spec error:', error);
    return sendInternalError(req, res, error);
  }
});

module.exports = router;
