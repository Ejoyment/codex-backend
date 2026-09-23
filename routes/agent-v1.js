const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const SpecModel = require('../models/SpecModel');
const gitService = require('../utils/gitService');
const sddVerificationService = require('../utils/sddVerificationService');
const realtimeBus = require('../utils/realtimeBus');
const { Worker } = require('worker_threads');
const path = require('path');

function spawnAgentWorker(executionId, taskId, workspaceId, specId, provider, localPrivacyMode) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '../utils/agentWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { executionId, taskId, workspaceId, specId, provider, localPrivacyMode },
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        realtimeBus.emitAgentProgress(executionId, msg.payload);
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

router.post('/delegate', authenticateToken, async (req, res) => {
  try {
    const { taskId, taskTitle, sessionId, workspaceId, summary = '', specId, provider = 'gemini', localPrivacyMode = false } = req.body;

    if (!taskId && !taskTitle) {
      return res.status(400).json({ success: false, message: 'taskId or taskTitle is required' });
    }

    let task = null;
    if (taskId) {
      task = await LocalTask.findOne({ _id: taskId, userId: req.userId }).lean();
    }

    const spec = specId ? await SpecModel.findById(specId) : null;

    const execution = await AgentExecution.create({
      userId: req.userId,
      sessionId: sessionId || task?.sessionId || 'standalone-task',
      taskTitle: taskTitle || task?.title || 'Workspace task',
      summary,
      status: 'running',
      approvalRequired: true,
      specRef: specId || null,
      metadata: {
        taskId: taskId || null,
        workspaceId: workspaceId || null,
        specId: specId || null,
        source: 'agent-v1/delegate',
        provider,
        localPrivacyMode,
      },
      logs: [{ timestamp: new Date(), message: 'Agent execution initialized' }],
    });

    if (task) {
      await LocalTask.findByIdAndUpdate(taskId, {
        status: 'in-progress',
        'agentExecution.status': 'running',
        'agentExecution.agentBranch': `agent/${taskId}`,
        'agentExecution.specRef': specId || null,
        updatedAt: new Date(),
      });
    }

    if (workspaceId) {
      try {
        await gitService.createBranch(workspaceId, `agent/${taskId}`);
      } catch (err) {
        console.warn('Branch creation warning:', err.message);
      }
    }

    realtimeBus.emitAgentProgress(req.userId, {
      type: 'delegate',
      executionId: execution._id,
      taskId,
      status: 'running',
      provider,
    });

    const workerPromise = spawnAgentWorker(
      execution._id.toString(),
      taskId,
      workspaceId,
      specId,
      provider,
      localPrivacyMode
    );

    workerPromise.then(async (result) => {
      execution.status = 'awaiting_approval';
      execution.logs.push({ timestamp: new Date(), message: 'Agent execution completed, awaiting approval' });
      await execution.save();
    }).catch(async (err) => {
      execution.status = 'failed';
      execution.logs.push({ timestamp: new Date(), message: `Agent worker error: ${err.message}` });
      await execution.save();
    });

    res.status(202).json({
      success: true,
      message: 'Task delegated to agent execution',
      execution,
      taskId: task?.id || taskId || null,
      specId: specId || null,
      agentBranch: `agent/${taskId}`,
    });
  } catch (error) {
    console.error('Delegate task error:', error);
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

    execution.status = 'completed';
    execution.approvalRequired = false;
    execution.updatedAt = new Date();
    execution.logs.push({ timestamp: new Date(), message: 'Agent changes approved and merged' });
    await execution.save();

    if (taskId) {
      await LocalTask.findByIdAndUpdate(taskId, { status: 'completed', completedAt: new Date(), updatedAt: new Date() });
    }

    try {
      if (execution.metadata?.agentBranch) {
        await gitService.mergeBranch(execution.metadata.agentBranch, 'main');
      }
    } catch (error) {
      console.error('Git merge error:', error);
      execution.logs.push({ timestamp: new Date(), message: `Merge warning: ${error.message}` });
      await execution.save();
    }

    const sddResult = await sddVerificationService.runSDDVerification(
      execution.metadata?.workspaceId,
      execution.specRef
    );

    res.json({ success: true, execution, message: 'Agent changes approved and merged', sddVerification: sddResult });
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
    execution.updatedAt = new Date();
    execution.logs.push({ timestamp: new Date(), message: 'Agent work rejected and task rolled back' });
    await execution.save();

    if (taskId) {
      await LocalTask.findByIdAndUpdate(taskId, { status: 'in-progress', updatedAt: new Date() });
    }

    try {
      if (execution.metadata?.agentBranch) {
        await gitService.resetBranch(execution.metadata.agentBranch);
      }
    } catch (error) {
      console.error('Git reset error:', error);
    }

    res.json({ success: true, execution, message: 'Agent work rejected and task rolled back' });
  } catch (error) {
    console.error('Reject execution error:', error);
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
