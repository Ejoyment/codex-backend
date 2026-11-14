const mongoose = require('mongoose');
const aiRouterService = require('./aiRouterService');
const SubagentExecution = require('../models/SubagentExecution');
const AgentExecution = require('../models/AgentExecution');
const { trimToLast, slicedPush } = require('./retention');
const { connectWorkerDatabase } = require('./agentWorkerDatabase');
const realtimeBus = require('./realtimeBus');

const SUBAGENT_LOG_MAX = 50;
const DEFAULT_MAX_ATTEMPTS = 2;
const SUBAGENT_TIMEOUT_MS = 300000; // 5 minutes

const SUBAGENT_ROLES = {
  researcher: {
    label: 'Researcher',
    description: 'Investigates the codebase, specs, and task context; returns findings and relevant file leads.',
    systemPrompt: `You are a Researcher subagent. Your job is to investigate a codebase and answer a specific research question concisely.

- Read the supplied task context and repository manifest.
- Identify the files, modules, and symbols most relevant to the research question.
- Return a short findings summary: what exists, where it lives, and how it relates to the question.
- Do not propose file changes. Do not write code. Return only findings.`,
    maxAttempts: 2,
  },
  coder: {
    label: 'Coder',
    description: 'Implements a focused code change; returns the implementation approach and target files.',
    systemPrompt: `You are a Coder subagent. Your job is to implement a focused code change within a real repository.

- Read the supplied task context and relevant files from the manifest.
- Propose the smallest coherent set of file changes that implements the instruction.
- Use \`### file: <path>\` markers with complete file bodies for each change.
- Reuse existing imports, helpers, and naming conventions. Do not invent parallel implementations.
- Do not run tests or verification. Return only the implementation plan and file changes.`,
    maxAttempts: 2,
  },
  reviewer: {
    label: 'Reviewer',
    description: 'Reviews a plan or code; returns feedback, issues, and acceptance criteria.',
    systemPrompt: `You are a Reviewer subagent. Your job is to review a plan or implementation and return actionable feedback.

- Read the supplied task context, plan, and any code under review.
- Identify correctness issues, missing edge cases, naming inconsistencies, and spec violations.
- Return concrete, prioritized feedback with file/line references where possible.
- Do not rewrite the code yourself. Return only the review.`,
    maxAttempts: 2,
  },
  tester: {
    label: 'Tester',
    description: 'Defines test strategy; returns test cases and verification steps.',
    systemPrompt: `You are a Tester subagent. Your job is to define how a change should be verified.

- Read the supplied task context and any code or plan under test.
- Identify the testable behaviors and edge cases.
- Return test cases, verification steps, and suggested test file locations.
- Do not execute tests. Return only the test plan.`,
    maxAttempts: 2,
  },
};

function roleConfig(role) {
  return SUBAGENT_ROLES[role] || SUBAGENT_ROLES.researcher;
}

async function loadParentContext(parentExecutionId) {
  try {
    const parent = await AgentExecution.findById(parentExecutionId).lean();
    if (!parent) return {};
    const parts = [];
    if (parent.taskTitle) parts.push(`Parent task: ${parent.taskTitle}`);
    if (parent.summary) parts.push(`Parent summary: ${String(parent.summary).slice(0, 3000)}`);
    if (parent.plan) parts.push(`Parent plan: ${String(parent.plan).slice(0, 4000)}`);
    return { parent, context: parts.join('\n') };
  } catch (error) {
    console.error('[subagent-service] could not load parent context:', error.message);
    return {};
  }
}

function buildSubagentPrompt(role, instruction, context) {
  const config = roleConfig(role);
  const lines = [
    config.systemPrompt,
    '',
    `ROLE: ${config.label}`,
    `INSTRUCTION: ${instruction}`,
  ];
  if (context) {
    lines.push('', 'PARENT EXECUTION CONTEXT', context);
  }
  lines.push('', 'Return a concise answer focused on your role. Do not attempt file changes unless your role is Coder.');
  return lines.join('\n');
}

async function callSubagentAI(instruction, systemPrompt, maxAttempts) {
  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastResult = await aiRouterService.routeChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: instruction },
        ],
        { agentMode: false },
        { timeoutMs: SUBAGENT_TIMEOUT_MS },
      );

      if (lastResult?.success && lastResult.content) {
        return { content: lastResult.content, attemptsUsed: attempt };
      }

      lastError = lastResult?.error || 'Subagent received no usable response';
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < maxAttempts) {
      continue;
    }
  }

  throw new Error(lastError || 'Subagent loop exhausted without a usable response');
}

async function runSubagentLoop(subagentExecutionId, role, instruction, userId) {
  await connectWorkerDatabase();

  const subagent = await SubagentExecution.findById(subagentExecutionId);
  if (!subagent) {
    throw new Error(`Subagent execution ${subagentExecutionId} not found`);
  }

  subagent.status = 'running';
  subagent.startedAt = new Date();
  subagent.logs.push({ timestamp: new Date(), message: `${role} subagent started` });
  trimToLast(subagent.logs, SUBAGENT_LOG_MAX);
  await subagent.save();

  realtimeBus.emitSubagentProgress(userId, {
    subagentExecutionId: subagent._id,
    parentExecutionId: subagent.parentExecutionId,
    role,
    status: 'running',
    phase: 'started',
    message: `${role} subagent started`,
  });

  const { context } = await loadParentContext(subagent.parentExecutionId);
  const systemPrompt = buildSubagentPrompt(role, instruction, context);
  const config = roleConfig(role);

  let output = '';
  try {
    const result = await callSubagentAI(instruction, systemPrompt, config.maxAttempts);
    output = result.content;

    subagent.output = output;
    subagent.status = 'complete';
    subagent.completedAt = new Date();
    subagent.logs.push({ timestamp: new Date(), message: `Subagent completed after ${result.attemptsUsed} attempt(s)` });
    trimToLast(subagent.logs, SUBAGENT_LOG_MAX);
    await subagent.save();

    realtimeBus.emitSubagentComplete(userId, {
      subagentExecutionId: subagent._id,
      parentExecutionId: subagent.parentExecutionId,
      role,
      status: 'complete',
      output,
      attemptsUsed: result.attemptsUsed,
    });

    return { success: true, output, subagentExecutionId };
  } catch (error) {
    const errorMessage = error.message || 'Subagent failed without an error message';

    subagent.status = 'failed';
    subagent.completedAt = new Date();
    subagent.error = errorMessage;
    subagent.logs.push({ timestamp: new Date(), message: `Subagent error: ${errorMessage}` });
    trimToLast(subagent.logs, SUBAGENT_LOG_MAX);
    await subagent.save();

    realtimeBus.emitSubagentError(userId, {
      subagentExecutionId: subagent._id,
      parentExecutionId: subagent.parentExecutionId,
      role,
      status: 'failed',
      error: errorMessage,
    });

    // Error isolation: subagent failure does not propagate to the caller.
    console.error(`[subagent-service] subagent ${role} (${subagentExecutionId}) failed:`, errorMessage);
    return { success: false, error: errorMessage, subagentExecutionId };
  }
}

/**
 * Spawn a subagent on a lead AgentExecution and start its lighter-weight tool
 * loop. The loop runs in the background; the caller gets the subagent record
 * immediately. Subagent failure is isolated and never crashes the lead agent.
 */
async function spawnSubagent({ parentExecutionId, role, instruction, userId, sessionId, taskId, projectId }) {
  if (!parentExecutionId) throw new Error('parentExecutionId is required');
  if (!role) throw new Error('role is required');
  if (!instruction?.trim()) throw new Error('instruction is required');
  if (!userId) throw new Error('userId is required');

  const validRoles = Object.keys(SUBAGENT_ROLES);
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role "${role}". Valid roles: ${validRoles.join(', ')}`);
  }

  const parent = await AgentExecution.findById(parentExecutionId).lean();
  if (!parent) {
    throw new Error(`Parent execution ${parentExecutionId} not found`);
  }

  const subagent = await SubagentExecution.create({
    _id: new mongoose.Types.ObjectId(),
    parentExecutionId,
    userId,
    sessionId: sessionId || parent.sessionId || null,
    taskId: taskId || parent.taskId || null,
    projectId: projectId || parent.projectId || null,
    role,
    status: 'idle',
    instruction: instruction.trim(),
    output: '',
    error: '',
    logs: [{ timestamp: new Date(), message: `Subagent ${role} created` }],
  });

  realtimeBus.emitSubagentSpawned(userId, {
    subagentExecutionId: subagent._id,
    parentExecutionId,
    role,
    status: 'idle',
    instruction: subagent.instruction,
  });

  // Fire-and-forget the lighter-weight loop; failures are isolated.
  runSubagentLoop(subagent._id.toString(), role, subagent.instruction, userId).catch(() => {
    // Errors are already logged and persisted inside runSubagentLoop.
  });

  return subagent;
}

async function listSubagents(parentExecutionId, userId) {
  return SubagentExecution.find({ parentExecutionId, userId })
    .sort({ createdAt: -1 })
    .lean();
}

async function getSubagent(subagentExecutionId, userId) {
  return SubagentExecution.findOne({ _id: subagentExecutionId, userId }).lean();
}

module.exports = {
  spawnSubagent,
  runSubagentLoop,
  listSubagents,
  getSubagent,
  SUBAGENT_ROLES,
  roleConfig,
};
