const agentChangeSet = require('./agentChangeSet');
const gitService = require('./gitService');
const LocalTask = require('../models/LocalTask');
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
  const branch = execution.branch || metaValue(execution, 'agentBranch');
  const hasChanges = Boolean((execution.proposedChanges || []).length || (execution.filesChanged || []).length);
  if (requireWorkspace && (!workspaceId || !branch)) {
    return conflict('Session is missing its workspace branch');
  }
  if (requireChanges && !hasChanges) {
    return conflict('This run produced no file changes to merge.');
  }

  let specResults = [];
  if (verifySpecs) {
    const verification = await verifySpecsForExecution(execution, taskId);
    specResults = verification.results;
    if (verification.blocking) {
      execution.validationResult = { specs: specResults, ranAt: new Date() };
      await execution.save();
      return conflict('Blocking spec requirements failed; the branch was not merged', {
        execution,
        sddVerification: specResults,
      });
    }
  }

  if (hasChanges) {
    const applied = await agentChangeSet.applyExecutionChanges(execution);
    if (applied.applied) {
      execution.logs.push({
        timestamp: new Date(),
        message: `Applied ${applied.applied} change(s) to workspace files (${applied.created || 0} created, ${applied.updated || 0} updated, ${applied.deleted || 0} deleted)`,
      });
    }
  }

  if (workspaceId && branch) {
    const branchList = await gitService.branches(workspaceId);
    const baseBranch = execution.baseBranch || 'main';
    if (branchList.success && branchList.branches.includes(baseBranch)) {
      await gitService.checkout(workspaceId, baseBranch);
    }
    const mergeResult = await gitService.merge(workspaceId, branch);
    if (!mergeResult.success) {
      execution.logs.push({ timestamp: new Date(), message: `Merge failed: ${mergeResult.error}` });
      await execution.save();
      return conflict(mergeResult.error, { execution });
    }
  }

  execution.status = source === 'socket' ? 'completed' : 'approved';
  execution.approvalRequired = false;
  execution.approvedBy = userId;
  execution.approvedAt = new Date();
  execution.updatedAt = new Date();
  execution.logs.push({ timestamp: new Date(), message: 'Agent changes approved and merged' });
  if (verifySpecs) execution.validationResult = { specs: specResults, ranAt: new Date() };
  await execution.save();

  const targetTaskId = taskId || execution.taskId;
  if (targetTaskId) {
    await LocalTask.findOneAndUpdate(
      { _id: targetTaskId, userId },
      { status: 'done', completedAt: new Date(), 'agentExecution.status': 'completed', updatedAt: new Date() }
    );
  }
  if (execution.metadata?.containerId) {
    try { await containerWorker.teardownWorker(targetTaskId); } catch { /* best effort */ }
  }

  return { ok: true, execution, sddVerification: specResults };
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

  const targetTaskId = taskId || execution.taskId;
  if (targetTaskId) {
    await LocalTask.findOneAndUpdate(
      { _id: targetTaskId, userId },
      { status: 'backlog', agentSessionId: null, branch: null, 'agentExecution.status': 'idle', updatedAt: new Date() }
    );
  }

  const branch = execution.branch || metaValue(execution, 'agentBranch');
  if (workspaceId && branch) {
    try {
      await gitService.deleteBranch(workspaceId, branch, execution.baseBranch || 'main');
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
