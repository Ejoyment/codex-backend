const { parentPort, workerData } = require('worker_threads');
const aiRouterService = require('./aiRouterService');
const sddVerificationService = require('./sddVerificationService');
const realtimeBus = require('./realtimeBus');
const AgentExecution = require('../models/AgentExecution');
const SpecModel = require('../models/SpecModel');
const CodeFile = require('../models/CodeFile');

const { executionId, taskId, workspaceId, specId, provider, localPrivacyMode } = workerData;

async function runAgent() {
  try {
    const execution = await AgentExecution.findById(executionId);
    if (!execution) {
      parentPort.postMessage({ type: 'error', error: 'Execution not found' });
      return;
    }

    const spec = specId ? await SpecModel.findById(specId) : null;
    const task = taskId ? await require('../models/LocalTask').findById(taskId) : null;

    const messages = [
      { role: 'system', content: `You are an autonomous AI agent executing a task. Task: ${execution.taskTitle}` },
    ];
    if (spec && spec.content) {
      messages.push({ role: 'system', content: `Spec contract: ${spec.content}` });
    }
    if (task && task.description) {
      messages.push({ role: 'user', content: task.description });
    }

    const codeFiles = await CodeFile.find({ company: workspaceId });
    const codeContext = {
      workspaceId,
      files: codeFiles.map(f => ({ path: f.path, name: f.name, language: f.language, content: f.content })),
      agentMode: true,
      instructions: spec ? `Follow the spec contract: ${spec.specId}` : undefined,
    };

    parentPort.postMessage({
      type: 'progress',
      payload: {
        executionId,
        status: 'running',
        phase: 'context_assembly',
        message: 'Assembling codebase context...',
      },
    });

    const result = await aiRouterService.routeChat(messages, codeContext, { provider, localPrivacyMode });

    if (result.success) {
      parentPort.postMessage({
        type: 'progress',
        payload: {
          executionId,
          status: 'awaiting_approval',
          phase: 'verification',
          message: 'Running SDD verification...',
        },
      });

      const sddResult = await sddVerificationService.runSDDVerification(workspaceId, specId);

      parentPort.postMessage({
        type: 'progress',
        payload: {
          executionId,
          status: 'awaiting_approval',
          phase: 'complete',
          message: 'Agent execution completed',
          sddVerification: sddResult,
        },
      });

      await AgentExecution.findByIdAndUpdate(executionId, {
        status: 'awaiting_approval',
        diffSummary: result.diffSummary || { filesChanged: 0, insertions: 0, deletions: 0 },
        logs: [...execution.logs, { timestamp: new Date(), message: 'Agent execution completed, awaiting approval' }],
      });

      parentPort.postMessage({ type: 'complete', result });
    } else {
      await AgentExecution.findByIdAndUpdate(executionId, {
        status: 'failed',
        logs: [...execution.logs, { timestamp: new Date(), message: `Agent execution failed: ${result.error}` }],
      });
      parentPort.postMessage({ type: 'error', error: result.error });
    }
  } catch (error) {
    await AgentExecution.findByIdAndUpdate(executionId, {
      status: 'failed',
      logs: [...execution.logs, { timestamp: new Date(), message: `Agent worker error: ${error.message}` }],
    });
    parentPort.postMessage({ type: 'error', error: error.message });
  }
}

runAgent();
