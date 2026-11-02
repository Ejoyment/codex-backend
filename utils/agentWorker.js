const { parentPort, workerData } = require('worker_threads');
const agentRunner = require('./agentRunner');
const sddVerificationService = require('./sddVerificationService');
const agentChangeSet = require('./agentChangeSet');
const AgentExecution = require('../models/AgentExecution');
const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');
const CodeFile = require('../models/CodeFile');
const SpecModel = require('../models/SpecModel');
const { slicedPush, trimToLast, MAX_AGENT_LOG } = require('./retention');
const { connectWorkerDatabase } = require('./agentWorkerDatabase');
const { projectFileQuery, resolveProjectId } = require('./fileScope');
const { executionId, taskId, workspaceId, projectId: workerProjectId, specIds = [], provider, model, localPrivacyMode } = workerData;

const AI_TIMEOUT_MS = (() => {
  const configured = Number(process.env.AGENT_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 900000;
})();

function postProgress(payload) {
  parentPort.postMessage({
    type: 'progress',
    payload: { executionId, ...payload },
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

function extractPlan(content) {
  const text = String(content || '').trim();
  if (!text) return '';
  const match = text.match(/(?:^|\n)(?:#{1,4}\s*)?(?:implementation\s+)?plan\b[\s\S]*/i);
  return (match ? match[0] : text).slice(0, 8000).trim();
}

function priorAttemptFrom(execution) {
  const logs = (execution.logs || []).slice(-10);
  const terminal = (execution.terminalLog || []).slice(-10);
  const hasPrior = (execution.retryCount || 0) > 0
    || (execution.tweaks || []).length > 0
    || execution.status === 'failed'
    || [...logs, ...terminal].some((entry) => /error|fail/i.test(String(entry?.type || entry?.message || '')));
  if (!hasPrior) return null;
  return {
    status: execution.status,
    error: execution.status === 'failed' ? execution.summary : '',
    summary: execution.summary,
    filesChanged: execution.filesChanged,
    logs: [...logs, ...terminal],
  };
}

async function loadProject(execution, task, explicitProjectId = null) {
  const projectId = explicitProjectId || execution.projectId || task?.projectId;
  if (!projectId) return null;
  try {
    return await LocalProject.findById(projectId).lean();
  } catch (error) {
    console.error('[agent-worker] could not load project context:', error.message);
    return null;
  }
}

async function loadLiveTask(taskId) {
  if (!taskId) return null;
  try {
    return await LocalTask.findById(taskId).lean();
  } catch (error) {
    console.error('[agent-worker] could not load live task:', error.message);
    return null;
  }
}

async function loadSpecs(snapshotSpecs, specIds) {
  const wanted = [...new Set([
    ...(specIds || []).map(String),
    ...(snapshotSpecs || []).map((spec) => String(spec?._id || '')).filter(Boolean),
  ])];
  const valid = wanted.filter((id) => /^[a-f0-9]{24}$/i.test(id));
  if (!valid.length) return snapshotSpecs || [];
  try {
    const loaded = await SpecModel.find({ _id: { $in: valid } }).lean();
    if (!loaded.length) return snapshotSpecs || [];
    return loaded.map((spec) => ({ ...spec, _id: String(spec._id) }));
  } catch (error) {
    console.error('[agent-worker] could not load live specs:', error.message);
    return snapshotSpecs || [];
  }
}

async function loadCodeFiles(workspaceId, projectId, snapshotFiles) {
  if (!workspaceId) return snapshotFiles || [];
  try {
    // Strict project scoping: a delegated task only sees files from its own
    // project. Without a project the query targets unassigned files, never the
    // whole workspace (other projects are unrelated applications).
    return await CodeFile.find(projectFileQuery(workspaceId, projectId))
      .select('path name language content')
      .lean();
  } catch (error) {
    console.error('[agent-worker] could not load live code files:', error.message);
    // Do not fall back to a snapshot that may predate project scoping.
    return [];
  }
}

async function runAgent() {
  try {
    await connectWorkerDatabase();
    const execution = await AgentExecution.findById(executionId);
    if (!execution) {
      parentPort.postMessage({ type: 'error', error: 'Execution not found' });
      return;
    }

    const snapshot = execution.contextSnapshot || {};
    const snapshotTask = snapshot.task || {};
    const specs = await loadSpecs(snapshot.specs || [], specIds);
    const liveTask = await loadLiveTask(taskId || execution.taskId);
    const task = {
      ...snapshotTask,
      ...(liveTask
        ? {
          title: liveTask.title || snapshotTask.title,
          description: liveTask.description || snapshotTask.description,
          priority: liveTask.priority || snapshotTask.priority,
          labels: liveTask.labels || snapshotTask.labels,
          projectId: liveTask.projectId || snapshotTask.projectId,
        }
        : {}),
    };
    const projectId = resolveProjectId({
      projectId: workerProjectId || snapshot.projectId || null,
      task,
      execution,
    });
    const codeFiles = await loadCodeFiles(workspaceId, projectId, snapshot.codebaseSnapshot?.files || []);
    const project = await loadProject(execution, task, projectId);

    let contextSummary = '';
    if (snapshot.contextBundle) {
      try {
        const agentContextService = require('./agentContextService');
        contextSummary = agentContextService.toPromptSummary(snapshot.contextBundle);
      } catch (error) {
        console.error('[agent-worker] could not summarize context bundle:', error.message);
      }
    }

    // Follow-up instructions from `/tweak` are part of the task brief, not a
    // replacement for it: the model still needs the repository and prior work.
    const feedback = (execution.tweaks || []).map((tweak) => tweak.instruction).filter(Boolean).slice(-5);
    if (feedback.length) {
      task.description = [task.description, ...feedback.map((line) => `Follow-up instruction: ${line}`)].filter(Boolean).join('\n');
    }

    const { messages, codeContext } = agentRunner.buildAgentContext({
      task,
      taskTitle: execution.taskTitle,
      project,
      specs,
      codeFiles,
      contextSummary,
      priorAttempt: priorAttemptFrom(execution),
      branch: execution.branch,
      baseBranch: execution.baseBranch,
      workspaceId,
      provider,
      model,
    });

    postProgress({
      status: 'running',
      phase: 'context_assembly',
      message: `Assembling context (${codeContext.files.length} relevant file(s), ${codeContext.fileManifest.total} in manifest)...`,
    });

    const result = await agentRunner.requestChangeSet({
      messages,
      codeContext,
      codeFiles,
      provider,
      model,
      localPrivacyMode,
      timeoutMs: AI_TIMEOUT_MS,
      onAttempt: ({ attempt, maxAttempts }) => postProgress({
        status: 'running',
        phase: 'generation',
        message: attempt === 1
          ? 'Agent is generating the implementation...'
          : `Agent response had no applicable changes; retrying (${attempt}/${maxAttempts})...`,
      }),
    });

    if (!result.success) {
      throw new Error(result.error || 'Agent execution failed without an error message');
    }

    if (result.planOnly) {
      // A prose-only answer is still useful work: keep it reviewable instead of
      // failing the whole delegation. The user can accept the plan, continue the
      // run with feedback, or delegate again.
      const plan = extractPlan(result.content);
      execution.status = 'awaiting_review';
      execution.summary = result.content || 'The agent returned a plan without file changes.';
      execution.plan = plan;
      execution.filesChanged = [];
      execution.proposedChanges = [];
      execution.diffSummary = { filesChanged: 0, insertions: 0, deletions: 0 };
      execution.validationResult = {
        specs: [],
        command: { status: 'skipped', reason: 'No file changes were proposed; nothing to verify.' },
      };
      execution.completedAt = new Date();
      setMetaValue(execution, 'planOnly', true);
      setMetaValue(execution, 'attemptsUsed', result.attemptsUsed);
      setMetaValue(execution, 'attemptSummary', agentRunner.describeAttempts(result.attempts));
      execution.logs = [
        ...(execution.logs || []),
        {
          timestamp: new Date(),
          message: `Agent returned a reviewable plan without file changes after ${result.attemptsUsed} attempt(s). Review it, continue with feedback, or delegate again.`,
        },
      ].slice(-MAX_AGENT_LOG);
      execution.terminalLog.push({
        timestamp: new Date(),
        type: 'plan',
        message: 'No applicable file changes were returned; plan is ready for review',
      });
      trimToLast(execution.terminalLog, MAX_AGENT_LOG);
      await execution.save();

      postProgress({
        status: 'awaiting_approval',
        phase: 'complete',
        message: 'Agent returned a plan without file changes; review or continue the run',
        planOnly: true,
      });
      parentPort.postMessage({
        type: 'complete',
        result: {
          success: true,
          content: result.content,
          planOnly: true,
          filesChanged: [],
          diffSummary: { filesChanged: 0, insertions: 0, deletions: 0 },
          attemptsUsed: result.attemptsUsed,
        },
      });
      return;
    }

    postProgress({
      status: 'awaiting_approval',
      phase: 'verification',
      message: 'Staging changes and running SDD verification...',
    });

    // Turn the model's proposal into a real, reviewable change set and stage it
    // on the isolated agent branch. The VFS is untouched until a human approves,
    // so no unverified change is ever visible in the editor.
    const changes = result.changes;
    const { filesChanged, diffSummary } = agentChangeSet.summarize(changes, codeFiles);
    let staged = { success: true, committed: false, skipped: true };
    if (workspaceId) {
      staged = await agentChangeSet.stageChanges(workspaceId, changes, {
        message: `Agent: ${task.title || execution.taskTitle}`.slice(0, 200),
        branch: execution.branch,
      });
      if (!staged.success || !staged.committed) {
        throw new Error(`Could not stage agent changes on branch ${execution.branch}: ${staged.error || staged.reason || 'commit did not complete'}`);
      }
    }
    const proposedFiles = agentChangeSet.applyChangesToFileList(changes, codeFiles);

    const specResults = await Promise.all(specs.map((spec) => sddVerificationService.verifySpecSnapshot(spec, proposedFiles)));
    const sddResult = { specs: specResults, command: { status: 'pending', reason: 'Verification commands require an isolated workspace runner' } };

    execution.status = 'awaiting_review';
    execution.filesChanged = filesChanged;
    execution.proposedChanges = changes.map((change) => ({
      path: change.path,
      action: change.action,
      language: change.language,
      content: change.content,
    }));
    execution.diffSummary = diffSummary;
    execution.summary = result.content || result.summary || '';
    execution.plan = extractPlan(result.content);
    execution.validationResult = sddResult;
    execution.completedAt = new Date();
    setMetaValue(execution, 'planOnly', false);
    setMetaValue(execution, 'attemptsUsed', result.attemptsUsed);
    setMetaValue(execution, 'attemptSummary', agentRunner.describeAttempts(result.attempts));
    execution.logs = [
      ...(execution.logs || []),
      {
        timestamp: new Date(),
        message: `Agent execution completed (${changes.length} file(s) staged on ${execution.branch || 'branch'}) after ${result.attemptsUsed} attempt(s), awaiting approval`,
      },
    ].slice(-MAX_AGENT_LOG);
    execution.terminalLog.push({
      timestamp: new Date(),
      type: 'complete',
      message: 'Agent response and spec checks completed',
    });
    trimToLast(execution.terminalLog, MAX_AGENT_LOG);
    await execution.save();

    postProgress({
      status: 'awaiting_approval',
      phase: 'complete',
      message: 'Agent execution completed',
      sddVerification: sddResult,
    });
    parentPort.postMessage({
      type: 'complete',
      result: {
        ...result,
        filesChanged,
        diffSummary,
        staged,
      },
    });
  } catch (error) {
    try {
      await AgentExecution.findByIdAndUpdate(executionId, {
        status: 'failed',
        summary: error.message,
        completedAt: new Date(),
        $push: {
          logs: slicedPush({ timestamp: new Date(), message: `Agent worker error: ${error.message}` }, MAX_AGENT_LOG),
          terminalLog: slicedPush({ timestamp: new Date(), type: 'error', message: error.message }, MAX_AGENT_LOG),
        },
      });
    } catch (persistError) {
      console.error('[agent-worker] could not persist failure:', persistError.message);
    }
    parentPort.postMessage({ type: 'error', error: error.message });
  }
}

if (parentPort) runAgent();

module.exports = { runAgent, extractPlan, priorAttemptFrom, metaValue };
