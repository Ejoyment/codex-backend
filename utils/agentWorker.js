const { parentPort, workerData } = require('worker_threads');
const aiRouterService = require('./aiRouterService');
const sddVerificationService = require('./sddVerificationService');
const realtimeBus = require('./realtimeBus');
const AgentExecution = require('../models/AgentExecution');
const { executionId, taskId, workspaceId, specIds = [], provider, localPrivacyMode } = workerData;

async function runAgent() {
  try {
    const execution = await AgentExecution.findById(executionId);
    if (!execution) {
      parentPort.postMessage({ type: 'error', error: 'Execution not found' });
      return;
    }

    const snapshot = execution.contextSnapshot || {};
    const task = snapshot.task || {};
    const specs = snapshot.specs || [];

    const messages = [
      { role: 'system', content: `You are an autonomous AI agent executing a task. Task: ${task.title || execution.taskTitle}\n\nProduce a concise implementation plan first, then provide specific file-level changes. Do not claim changes were applied unless a tool actually applied them.` },
    ];
    if (specs.length) {
      messages.push({ role: 'system', content: `Frozen spec contracts:\n${JSON.stringify(specs.map((spec) => ({ name: spec.title, description: spec.description, targetModules: spec.targetModules, architecturalRules: spec.architecturalRules, requirements: spec.requirements, forbiddenImports: spec.forbiddenImports, constraints: spec.constraints })), null, 2)}` });
    }
    if (task.description) {
      messages.push({ role: 'user', content: task.description });
    }
    if (execution.summary) {
      messages.push({ role: 'assistant', content: `Previous work in this session:\n${execution.summary}` });
    }
    for (const tweak of execution.tweaks || []) messages.push({ role: 'user', content: `Follow-up instruction: ${tweak.instruction}` });

    const codeFiles = snapshot.codebaseSnapshot?.files || [];
    const codeContext = {
      workspaceId,
      files: codeFiles,
      agentMode: true,
      instructions: `Use branch ${execution.branch} based on ${execution.baseBranch}. Follow these architectural rules: ${(snapshot.architecturalRules || []).join('; ') || 'none supplied'}. Return a written plan and file-level proposed changes.`,
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

      const specResults = await Promise.all(specs.map((spec) => sddVerificationService.verifySpecSnapshot(spec, codeFiles)));
      const sddResult = { specs: specResults, command: { status: 'pending', reason: 'Verification commands require an isolated workspace runner' } };
      const planMatch = result.content?.match(/(?:plan|implementation plan)[\s\S]{0,1200}/i);

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
        status: 'awaiting_review',
        diffSummary: result.diffSummary || { filesChanged: 0, insertions: 0, deletions: 0 },
        summary: result.content || result.summary || '',
        plan: planMatch?.[0] || '',
        validationResult: sddResult,
        completedAt: new Date(),
        logs: [...execution.logs, { timestamp: new Date(), message: 'Agent execution completed, awaiting approval' }],
        $push: { terminalLog: { timestamp: new Date(), type: 'complete', message: 'Agent response and spec checks completed' } },
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
      completedAt: new Date(),
      $push: {
        logs: { timestamp: new Date(), message: `Agent worker error: ${error.message}` },
        terminalLog: { timestamp: new Date(), type: 'error', message: error.message },
      },
    });
    parentPort.postMessage({ type: 'error', error: error.message });
  }
}

runAgent();
