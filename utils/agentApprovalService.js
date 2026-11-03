const agentChangeSet = require('./agentChangeSet');
const gitService = require('./gitService');
const LocalTask = require('../models/LocalTask');
const AgentExecution = require('../models/AgentExecution');
const containerWorker = require('./containerWorker');
const sddVerificationService = require('./sddVerificationService');

function metaValue(execution, key) {
  const meta = execution?.metadata;
  if (!meta) return undefined;
  if (typeof meta.get === 'function') return meta.get(key);
  return meta[key];
}

function conflict(message, extra = {}) {
  return { ok: false, status: 409, message, ...extra };
}

async function verifySpecsForExecution(execution, taskId) {
  const specIds = metaValue(execution, 'specIds') || [execution.specRef].filter(Boolean);
  const results = await Promise.all(
    specIds.map((id) => sddVerificationService.verifySpec(id, taskId || execution.taskId))
  );
  const blocking = results.some((result) =>
    (result.requirements || []).some((requirement) => requirement.severity === 'blocking' && requirement.status === 'fail') ||
    (result.forbiddenImports || []).some((item) => item.status === 'fail') ||
    (result.results || []).some((item) => item.passed === false)
  );
  return { results, blocking };
}

async function approveExecution({
  execution,
  userId,
  taskId,
  workspaceId,
  source = 'rest',
  verifySpecs = false,
  requireWorkspace = true,
  requireChanges = true,
} = {}) {
  const previousStatus = execution.status;
  const claim = await AgentExecution.findOneAndUpdate(
    {
      _id: execution._id,
      status: { $in: ['awaiting_review', 'awaiting_approval'] },
    },
    { $set: { status: 'approving' } },
    { new: true }
  );
  if (!claim) {
    return conflict('This execution is already being approved or is no longer awaiting approval', { execution });
  }
  execution.status = 'approving';
  let approvalSaved = false;

  try {
  const branch = execution.branch || metaValue(execution, 'agentBranch');
  const hasChanges = Boolean((execution.proposedChanges || []).length || (execution.filesChanged || []).length);
  const planOnly = !hasChanges;
  if (requireWorkspace && (!workspaceId || !branch)) {
    execution.status = previousStatus;
    await execution.save();
    return conflict('Session is missing its workspace branch');
  }
  if (requireChanges && !hasChanges) {
    execution.status = previousStatus;
    await execution.save();
    return conflict('This run produced no file changes to merge.');
  }

  let specResults = [];
  if (verifySpecs && hasChanges) {
    const verification = await verifySpecsForExecution(execution, taskId);
    specResults = verification.results;
    if (verification.blocking) {
      execution.status = previousStatus;
      execution.validationResult = { specs: specResults, ranAt: new Date() };
      await execution.save();
      return conflict('Blocking spec requirements failed; the branch was not merged', {
        execution,
        sddVerification: specResults,
      });
    }
  }

  // A plan-only run has no branch commit to merge. Accepting it records the
  // human decision and closes the task without pretending files changed.
  let appliedChanges = null;
  if (workspaceId && branch && hasChanges) {
    const baseBranch = execution.baseBranch || 'main';
    const mergeResult = await gitService.withRepositoryLock(workspaceId, execution.projectId, async () => {
      const branchList = await gitService.branches(workspaceId, execution.projectId);
      if (!branchList.success || !branchList.branches.includes(baseBranch)) {
        return { success: false, error: branchList.error || `Base branch ${baseBranch} does not exist` };
      }
      const checkout = await gitService.checkout(workspaceId, baseBranch, execution.projectId);
      if (!checkout.success) return { success: false, error: checkout.error || `Could not check out ${baseBranch}` };
      const current = await gitService.getGit(workspaceId, execution.projectId);
      const currentStatus = await current.status();
      if (currentStatus.current !== baseBranch) {
        return { success: false, error: `Merge target is ${currentStatus.current || 'detached'}, expected ${baseBranch}` };
      }
      const result = await gitService.merge(workspaceId, branch, execution.projectId);
      if (!result.success) return result;
      if (hasChanges) {
        appliedChanges = await agentChangeSet.applyExecutionChanges(execution);
      }
      return result;
    });
    if (!mergeResult.success) {
      execution.status = previousStatus;
      execution.logs.push({ timestamp: new Date(), message: `Merge failed: ${mergeResult.error}` });
      await execution.save();
      return conflict(mergeResult.error, { execution });
    }
    const cleanup = await gitService.removeAgentWorktree(
      workspaceId,
      execution.projectId,
      String(execution._id)
    );
    if (!cleanup.success) console.error('[agent-approval] worktree cleanup failed:', cleanup.error);
  } else if (hasChanges) {
    appliedChanges = await agentChangeSet.applyExecutionChanges(execution);
  }

  if (appliedChanges?.applied) {
      execution.logs.push({
        timestamp: new Date(),
        message: `Applied ${appliedChanges.applied} change(s) to project files (${appliedChanges.created || 0} created, ${appliedChanges.updated || 0} updated, ${appliedChanges.deleted || 0} deleted)`,
      });
  }

  execution.status = source === 'socket' ? 'completed' : 'approved';
  execution.approvalRequired = false;
  execution.approvedBy = userId;
  execution.approvedAt = new Date();
  execution.updatedAt = new Date();
  execution.logs.push({
    timestamp: new Date(),
    message: planOnly
      ? 'Agent plan accepted (no file changes were proposed)'
      : 'Agent changes approved and merged',
  });
  if (verifySpecs) execution.validationResult = { specs: specResults, ranAt: new Date() };
  await execution.save();
  approvalSaved = true;

  const targetTaskId = taskId || execution.taskId || metaValue(execution, 'taskId');
  if (targetTaskId) {
    try {
      await LocalTask.findOneAndUpdate(
        { _id: targetTaskId, userId },
        { status: 'done', completedAt: new Date(), 'agentExecution.status': 'completed', updatedAt: new Date() }
      );
    } catch (error) {
      console.error('[agent-approval] could not sync completed task:', error.message);
    }
  }
  if (execution.metadata?.containerId) {
    try { await containerWorker.teardownWorker(targetTaskId); } catch { /* best effort */ }
  }

  if (hasChanges && execution.projectId) {
    setImmediate(() => {
      require('./agentAutoDeploy').redeployApprovedProject({ execution, userId, workspaceId })
        .catch((error) => console.error('[agent-approval] automatic redeployment failed:', error.message));
    });
  }

  return { ok: true, execution, sddVerification: specResults };
  } catch (error) {
    if (!approvalSaved) {
      execution.status = previousStatus;
      await execution.save();
    }
    throw error;
  }
}

async function rejectExecution({
  execution,
  userId,
  taskId,
  workspaceId,
  reason = '',
  source = 'rest',
} = {}) {
  execution.status = 'rejected';
  execution.approvalRequired = false;
  execution.rejectedBy = userId;
  execution.rejectedAt = new Date();
  execution.rejectionReason = reason;
  execution.updatedAt = new Date();
  execution.proposedChanges = [];
  execution.filesChanged = [];
  execution.logs.push({ timestamp: new Date(), message: 'Agent work rejected and task rolled back' });
  await execution.save();

  const targetTaskId = taskId || execution.taskId || metaValue(execution, 'taskId');
  if (targetTaskId) {
    await LocalTask.findOneAndUpdate(
      { _id: targetTaskId, userId },
      { status: 'backlog', agentSessionId: null, branch: null, 'agentExecution.status': 'idle', updatedAt: new Date() }
    );
  }

  const branch = execution.branch || metaValue(execution, 'agentBranch');
  if (workspaceId && branch) {
    try {
      await gitService.deleteBranch(workspaceId, branch, execution.baseBranch || 'main', execution.projectId);
    } catch (error) {
      console.error('Agent branch cleanup failed:', error.message);
    }
  }
  if (execution.metadata?.containerId) {
    try { await containerWorker.teardownWorker(targetTaskId); } catch { /* best effort */ }
  }

  return { ok: true, execution, source };
}

module.exports = { approveExecution, rejectExecution };
