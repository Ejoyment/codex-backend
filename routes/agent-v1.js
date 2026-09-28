const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { enforceConcurrentJobs, enforceTaskTimeout, enforceCreditPool, enforceCloudComputeLimit } = require('../middleware/tierEnforcement');
const CreditPoolService = require('../utils/creditPoolService');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const SpecModel = require('../models/SpecModel');
const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const gitService = require('../utils/gitService');
const sddVerificationService = require('../utils/sddVerificationService');
const realtimeBus = require('../utils/realtimeBus');
const { Worker } = require('worker_threads');
const path = require('path');

function spawnAgentWorker(executionId, taskId, workspaceId, specIds, provider, localPrivacyMode) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '../utils/agentWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { executionId, taskId, workspaceId, specIds, provider, localPrivacyMode },
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        realtimeBus.emitAgentProgress(executionId, msg.payload);
        AgentExecution.findByIdAndUpdate(executionId, {
          $push: { terminalLog: { timestamp: new Date(), type: msg.payload.phase || 'progress', message: msg.payload.message || msg.payload.status || 'Agent progress' } },
        }).catch(() => {});
      } else if (msg.type === 'complete') {
        resolve(msg.result);
      } else if (msg.type === 'error') {
        reject(new Error(msg.error));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Agent worker exited with code ${code}`));
    });
  });
}

router.post('/delegate', authenticateToken, enforceConcurrentJobs(), enforceTaskTimeout(), enforceCreditPool(), enforceCloudComputeLimit(), async (req, res) => {
  try {
    const { taskId, taskTitle, sessionId, summary = '', provider = 'gemini', localPrivacyMode = false } = req.body;

    if (!taskId && !taskTitle) {
      return res.status(400).json({ success: false, message: 'taskId or taskTitle is required' });
    }

    const { tier } = req.subscription;
    if (tier === 'developer') {
      return res.status(403).json({ success: false, message: 'Agent delegation requires Pro tier or higher. Use local BYOM.', requiresUpgrade: true });
    }

    let task = null;
    if (taskId) {
      task = await LocalTask.findOne({ _id: taskId, userId: req.userId });
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
      if (task.agentSessionId) {
        const activeExecution = await AgentExecution.findOne({
          _id: task.agentSessionId,
          status: { $in: ['queued', 'running', 'awaiting_review', 'awaiting_approval'] },
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

    const workspaceId = req.body.workspaceId || task?.companyId?.toString();
    if (!workspaceId) {
      return res.status(400).json({ success: false, message: 'A workspace is required to create an isolated agent branch' });
    }
    const workspace = await Company.findById(workspaceId).select('owner members');
    const isMember = workspace && (workspace.owner?.toString() === req.userId || workspace.members.some((member) => member.user?.toString() === req.userId));
    if (!isMember) return res.status(403).json({ success: false, message: 'Workspace access denied' });
    if (task?.companyId && task.companyId.toString() !== workspaceId) {
      return res.status(403).json({ success: false, message: 'Task is linked to a different workspace' });
    }

    const requestedSpecIds = [...new Set([...(req.body.specIds || []), ...(req.body.specId ? [req.body.specId] : []), ...(task?.specIds || []).map(String)])];
    const specs = requestedSpecIds.length
      ? await SpecModel.find({ _id: { $in: requestedSpecIds }, workspaceId }).lean()
      : [];
    if (specs.length !== requestedSpecIds.length) {
      return res.status(400).json({ success: false, message: 'One or more attached specs were not found in this workspace' });
    }
    const codeFiles = await CodeFile.find({ company: workspaceId }).select('path name language content').lean();
    const taskTitleValue = taskTitle || task?.title || 'Workspace task';
    const slug = taskTitleValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
    const branch = `feature/${task?._id || Date.now()}-${slug}`;
    await gitService.init(workspaceId);
    const branchList = await gitService.branches(workspaceId);
    const baseBranch = branchList.success && branchList.branches.includes('main') ? 'main' : (branchList.current || 'main');
    if (branchList.success && branchList.branches.includes(baseBranch)) await gitService.checkout(workspaceId, baseBranch);
    const branchResult = await gitService.createBranch(workspaceId, branch);
    if (!branchResult.success) {
      return res.status(409).json({ success: false, message: `Could not create isolated branch: ${branchResult.error}` });
    }

    const contextSnapshot = {
      task: task ? { id: task._id.toString(), title: task.title, description: task.description, priority: task.priority, figmaNodeId: task.figmaNodeId } : { title: taskTitleValue, description: summary },
      specs: specs.map((spec) => ({ ...spec, _id: spec._id.toString() })),
      codebaseSnapshot: { branch: baseBranch, files: codeFiles.map((file) => ({ path: file.path, name: file.name, language: file.language, content: file.content })) },
      architecturalRules: specs.flatMap((spec) => spec.architecturalRules || []),
      figmaContext: null,
      capturedAt: new Date(),
    };

    const execution = await AgentExecution.create({
      userId: req.userId,
      sessionId: sessionId || null,
      taskId: task?._id || null,
      projectId: task?.projectId || null,
      taskTitle: taskTitleValue,
      summary,
      status: 'queued',
      approvalRequired: true,
      specRef: specs[0]?._id || null,
      branch,
      baseBranch,
      contextSnapshot,
      model: provider,
      startedAt: new Date(),
      metadata: {
        taskId: taskId || null,
        workspaceId,
        specIds: specs.map((spec) => spec._id.toString()),
        agentBranch: branch,
        source: 'agent-v1/delegate',
        provider,
        localPrivacyMode,
      },
      logs: [{ timestamp: new Date(), message: 'Agent execution initialized' }],
    });

    if (task) {
      task.status = 'in_progress';
      task.companyId = workspaceId;
      task.agentSessionId = execution._id;
      task.branch = branch;
      task.agentExecution = {
        ...(task.agentExecution?.toObject?.() || task.agentExecution || {}),
        status: 'running',
        agentBranch: branch,
        specRef: specs[0]?._id || null,
      };
      await task.save();
      await LocalTask.findByIdAndUpdate(taskId, {
        'agentExecution.status': 'running',
        updatedAt: new Date(),
      });
    }

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
      specs.map((spec) => spec._id.toString()),
      provider,
      localPrivacyMode
    );

    workerPromise.then(async (result) => {
      execution.status = 'awaiting_review';
      execution.completedAt = new Date();
      execution.logs.push({ timestamp: new Date(), message: 'Agent execution completed, awaiting approval' });
      await execution.save();
      if (task) await LocalTask.findByIdAndUpdate(task._id, { 'agentExecution.status': 'awaiting_approval', updatedAt: new Date() });
    }).catch(async (err) => {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.logs.push({ timestamp: new Date(), message: `Agent worker error: ${err.message}` });
      await execution.save();
      if (task) await LocalTask.findByIdAndUpdate(task._id, { 'agentExecution.status': 'failed', updatedAt: new Date() });
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
    console.error('Delegate task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await AgentExecution.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    const workspaceId = execution.metadata?.get?.('workspaceId') || execution.metadata?.workspaceId;
    const branch = execution.branch || execution.metadata?.get?.('agentBranch') || execution.metadata?.agentBranch;
    if (!workspaceId || !branch) return res.status(409).json({ success: false, message: 'Session is missing its workspace branch' });
    const specIds = execution.metadata?.get?.('specIds') || execution.metadata?.specIds || [execution.specRef].filter(Boolean);
    const specResults = await Promise.all(specIds.map((id) => sddVerificationService.verifySpec(id, taskId || execution.taskId)));
    const blockingFailures = specResults.some((result) =>
      (result.requirements || []).some((requirement) => requirement.severity === 'blocking' && requirement.status === 'fail') ||
      (result.forbiddenImports || []).some((item) => item.status === 'fail') ||
      (result.results || []).some((item) => item.passed === false)
    );
    if (blockingFailures) {
      execution.validationResult = { specs: specResults, ranAt: new Date() };
      await execution.save();
      return res.status(409).json({ success: false, message: 'Blocking spec requirements failed; the branch was not merged', execution, sddVerification: specResults });
    }
    if (!(execution.filesChanged || []).length && !(execution.diffSummary?.filesChanged > 0)) {
      return res.status(409).json({ success: false, message: 'This run has no applied file changes to merge. The current worker returns a proposal but does not write to the branch.' });
    }
    const branchList = await gitService.branches(workspaceId);
    const baseBranch = execution.baseBranch || 'main';
    if (branchList.success && branchList.branches.includes(baseBranch)) await gitService.checkout(workspaceId, baseBranch);
    const mergeResult = await gitService.merge(workspaceId, branch);
    if (!mergeResult.success) {
      execution.logs.push({ timestamp: new Date(), message: `Merge failed: ${mergeResult.error}` });
      await execution.save();
      return res.status(409).json({ success: false, message: mergeResult.error, execution });
    }
    execution.status = 'approved';
    execution.approvalRequired = false;
    execution.approvedBy = req.userId;
    execution.approvedAt = new Date();
    execution.updatedAt = new Date();
    execution.logs.push({ timestamp: new Date(), message: 'Agent changes approved and merged' });
    if (taskId || execution.taskId) {
      await LocalTask.findByIdAndUpdate(taskId || execution.taskId, { status: 'done', completedAt: new Date(), updatedAt: new Date() });
    }
    execution.validationResult = { specs: specResults, ranAt: new Date() };
    await execution.save();
    res.json({ success: true, execution, message: 'Agent branch merged', sddVerification: specResults });
  } catch (error) {
    console.error('Approve execution error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reject', authenticateToken, async (req, res) => {
  try {
    const { executionId, taskId } = req.body;
    const execution = await AgentExecution.findOne({ _id: executionId || taskId, userId: req.userId });
    if (!execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    execution.status = 'rejected';
    execution.approvalRequired = false;
    execution.rejectedBy = req.userId;
    execution.rejectedAt = new Date();
    execution.rejectionReason = req.body.reason || '';
    execution.updatedAt = new Date();
    execution.logs.push({ timestamp: new Date(), message: 'Agent work rejected and task rolled back' });
    await execution.save();

    const task = taskId || execution.taskId;
    if (task) await LocalTask.findByIdAndUpdate(task, { status: 'backlog', agentSessionId: null, branch: null, 'agentExecution.status': 'idle', updatedAt: new Date() });
    const workspaceId = execution.metadata?.get?.('workspaceId') || execution.metadata?.workspaceId;
    if (workspaceId && execution.branch) await gitService.deleteBranch(workspaceId, execution.branch, execution.baseBranch || 'main');

    res.json({ success: true, execution, message: 'Agent work rejected and task rolled back' });
  } catch (error) {
    console.error('Reject execution error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tweak', authenticateToken, async (req, res) => {
  try {
    const { executionId, instruction } = req.body;
    if (!instruction?.trim()) return res.status(400).json({ success: false, message: 'Instruction is required' });
    const execution = await AgentExecution.findOne({ _id: executionId, userId: req.userId });
    if (!execution) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!['awaiting_review', 'awaiting_approval', 'failed'].includes(execution.status)) return res.status(409).json({ success: false, message: 'Session cannot be resumed in its current state' });
    execution.tweaks.push({ instruction: instruction.trim(), addedAt: new Date() });
    execution.status = 'running';
    execution.startedAt = new Date();
    execution.completedAt = null;
    execution.terminalLog.push({ timestamp: new Date(), type: 'follow_up', message: instruction.trim() });
    await execution.save();
    const workspaceId = execution.metadata?.get?.('workspaceId') || execution.metadata?.workspaceId;
    const specIds = execution.metadata?.get?.('specIds') || execution.metadata?.specIds || [];
    const localPrivacyMode = execution.metadata?.get?.('localPrivacyMode') || execution.metadata?.localPrivacyMode || false;
    spawnAgentWorker(execution._id.toString(), execution.taskId?.toString(), workspaceId, specIds, execution.model || 'gemini', localPrivacyMode)
      .then(async () => {
        execution.status = 'awaiting_review';
        execution.completedAt = new Date();
        await execution.save();
      })
      .catch(async (error) => {
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.terminalLog.push({ timestamp: new Date(), type: 'error', message: error.message });
        await execution.save();
      });
    res.json({ success: true, execution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { executionId, taskId, specId } = req.body;
    const execution = await AgentExecution.findById(executionId || taskId);
    const spec = specId ? await SpecModel.findById(specId) : (execution?.specRef ? await SpecModel.findById(execution.specRef) : null);

    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
    }

    const result = await sddVerificationService.verifySpec(spec._id, taskId);
    res.json({ success: true, verification: result });
  } catch (error) {
    console.error('Verify spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
