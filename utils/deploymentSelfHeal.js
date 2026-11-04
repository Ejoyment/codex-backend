/**
 * Deployment Self-Heal Worker
 *
 * Failed deployments are not left for a human to notice. Every failure is
 * scheduled here and a background poller either:
 *
 *   - retries platform/transient failures directly, or
 *   - for user-code failures (build errors, app crashes) runs the coding agent
 *     against the deployment's project, lets it edit files, then redeploys.
 *
 * The loop is bounded by attempts + exponential backoff, and a workspace can
 * opt out with `settings.selfHeal === false`. Set DEPLOY_SELF_HEAL_ENABLED=false
 * to disable it process-wide.
 */

const Deployment = require('../models/Deployment');
const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const LocalProject = require('../models/LocalProject');
const TeamProject = require('../models/TeamProject');
const AgentExecution = require('../models/AgentExecution');
const agentOrchestrator = require('./agentOrchestrator');
const { ensurePersonalWorkspace } = require('./personalWorkspace');
const { redeployDeployment } = require('./agentAutoDeploy');
const { notifyDeploymentEvent } = require('./notificationTriggers');

function readInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const ENABLED = process.env.DEPLOY_SELF_HEAL_ENABLED !== 'false';
const POLL_INTERVAL_MS = readInt('DEPLOY_SELF_HEAL_POLL_MS', 60 * 1000);
const MAX_ATTEMPTS = Math.max(1, readInt('DEPLOY_SELF_HEAL_MAX_ATTEMPTS', 3));
const LOOKBACK_MS = readInt('DEPLOY_SELF_HEAL_LOOKBACK_MS', 24 * 60 * 60 * 1000);
const BACKOFF_BASE_MS = readInt('DEPLOY_SELF_HEAL_BACKOFF_MS', 2 * 60 * 1000);
const BACKOFF_MAX_MS = readInt('DEPLOY_SELF_HEAL_BACKOFF_MAX_MS', 15 * 60 * 1000);
const BATCH_SIZE = Math.max(1, readInt('DEPLOY_SELF_HEAL_BATCH', 5));
const STALE_RUNNING_MS = readInt('DEPLOY_SELF_HEAL_STALE_MS', 30 * 60 * 1000);
const AGENT_TIMEOUT_MS = readInt('DEPLOY_SELF_HEAL_AGENT_TIMEOUT_MS', 10 * 60 * 1000);

// Autonomous repairs may read broadly, but only create/update files. Deleting
// source or executing arbitrary code needs a human, and would otherwise stall
// forever on the HITL gate because there is no one watching the background run.
const SAFE_TOOLS = [
  'read_file',
  'list_files',
  'search_code',
  'analyze_code',
  'get_workspace_snapshot',
];
const AUTO_APPROVE_TOOLS = ['create_file', 'update_file', 'create_multiple_files'];
const AUTONOMOUS_TOOLS = [...SAFE_TOOLS, ...AUTO_APPROVE_TOOLS];
const CHANGING_TOOLS = new Set(AUTO_APPROVE_TOOLS);

let timer = null;
let activeTick = null;

function logError(context, error) {
  console.error(`[deploy-self-heal] ${context}:`, error?.message || error);
}

function backoffFor(attempts) {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)), BACKOFF_MAX_MS);
}

function deploymentNotificationTarget(deployment, workspaceId) {
  return {
    _id: deployment._id,
    environment: deployment.subdomain,
    company: workspaceId || null,
  };
}

async function resolveRepairWorkspaces(deployment, projectId, files = []) {
  const candidates = [];

  // CodeFile.company is the authoritative scope for the repair agent's file
  // tools, so it comes first.
  for (const file of files) {
    if (file?.company) candidates.push(String(file.company));
  }
  if (deployment.workspaceId) candidates.push(String(deployment.workspaceId));

  if (projectId) {
    try {
      const local = await LocalProject.findById(projectId).select('workspaceId').lean();
      if (local?.workspaceId) candidates.push(String(local.workspaceId));
      if (!local) {
        const team = await TeamProject.findById(projectId).select('company').lean();
        if (team?.company) candidates.push(String(team.company));
      }
    } catch (error) {
      logError('could not resolve the project workspace', error);
    }
  }

  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length) return unique;

  // A deployment does not require a workspace: local projects can be deployed
  // without one, and the owner may not belong to any company. Give the repair
  // a private scope so file tools stay tenant-safe, mirroring how projects are
  // created. The agent then has a real workspace even when the user has none.
  try {
    const personal = await ensurePersonalWorkspace(deployment.userId);
    if (personal?._id) return [String(personal._id)];
  } catch (error) {
    logError('could not create a personal workspace for self-heal', error);
  }
  return [];
}

async function markGaveUp(deployment, summary, lastError, workspaceId, { notify = true } = {}) {
  const completedAt = new Date();
  await Deployment.updateOne(
    { _id: deployment._id, 'selfHeal.status': 'running' },
    {
      $set: {
        'selfHeal.status': 'gave_up',
        'selfHeal.completedAt': completedAt,
        'selfHeal.nextAttemptAt': null,
        'selfHeal.summary': summary,
        'selfHeal.lastError': lastError || null,
      },
    }
  );
  if (notify) {
    notifyDeploymentEvent({
      type: 'deployment_heal_failed',
      deployment: deploymentNotificationTarget(deployment, workspaceId),
      userId: deployment.userId,
      detail: summary,
    });
  }
  return { gaveUp: true, summary };
}

async function markSucceeded(deployment, summary, workspaceId) {
  await Deployment.updateOne(
    { _id: deployment._id, 'selfHeal.status': 'running' },
    {
      $set: {
        'selfHeal.status': 'succeeded',
        'selfHeal.completedAt': new Date(),
        'selfHeal.nextAttemptAt': null,
        'selfHeal.summary': summary,
        'selfHeal.lastError': null,
      },
    }
  );
  notifyDeploymentEvent({
    type: 'deployment_healed',
    deployment: deploymentNotificationTarget(deployment, workspaceId),
    userId: deployment.userId,
    detail: summary,
  });
  return { healed: true, summary };
}

async function markRetry(deployment, error, workspaceId) {
  const attempts = Number(deployment?.selfHeal?.attempts) || 1;
  const message = String(error?.message || error || 'Self-heal attempt failed').slice(0, 1000);

  if (attempts >= MAX_ATTEMPTS) {
    return markGaveUp(
      deployment,
      `Deployment self-heal gave up after ${attempts} attempt(s): ${message}`,
      message,
      workspaceId
    );
  }

  const nextAttemptAt = new Date(Date.now() + backoffFor(attempts));
  await Deployment.updateOne(
    { _id: deployment._id, 'selfHeal.status': 'running' },
    {
      $set: {
        'selfHeal.status': 'pending',
        'selfHeal.nextAttemptAt': nextAttemptAt,
        'selfHeal.lastError': message,
        'selfHeal.summary': `Attempt ${attempts}/${MAX_ATTEMPTS} failed; retrying.`,
      },
    }
  );
  return { retry: true, attempts, nextAttemptAt };
}

function buildFileManifest(files = []) {
  if (!files.length) return '(no project files were found for this deployment)';
  return files
    .slice(0, 200)
    .map((file) => {
      const dir = file.path && file.path !== '/' ? String(file.path).replace(/\/+$/, '') : '';
      const name = `${dir ? `${dir}/` : ''}${file.name}`;
      return `- ${name} (id: ${file._id})`;
    })
    .join('\n');
}

const ENTRY_FILE_NAMES = new Set([
  'package.json', 'dockerfile', 'index.js', 'server.js', 'app.js', 'main.js',
  'main.py', 'requirements.txt', 'pyproject.toml', 'go.mod', 'go.sum',
  'gemfile', 'composer.json', 'nginx.conf', '.env.example', 'vite.config.js',
  'next.config.js', 'tsconfig.json',
]);

// Pick a handful of files whose contents are worth putting directly in the
// repair prompt: files named in the build error first, then common entrypoints.
function pickPreviewFiles(files = [], deployment = {}) {
  const haystack = `${deployment.errorMessage || ''}\n${deployment.buildLogs || ''}`.toLowerCase();
  return files
    .map((file) => {
      const name = String(file.name || '').toLowerCase();
      let score = 0;
      if (name && haystack.includes(name)) score += 10;
      if (ENTRY_FILE_NAMES.has(name)) score += 5;
      return { file, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ file }) => file);
}

function buildHealingGoal(deployment, projectId, files = [], previewFiles = []) {
  const logs = String(deployment.buildLogs || '').slice(-12000);
  const runtimeLogs = String(deployment.runtimeLogs || '').slice(-4000);
  const subdomain = deployment.subdomain;
  const previews = previewFiles
    .filter((file) => typeof file.content === 'string' && file.content.length)
    .map((file) => {
      const dir = file.path && file.path !== '/' ? String(file.path).replace(/\/+$/, '') : '';
      const label = `${dir ? `${dir}/` : ''}${file.name}`;
      const body = file.content.length > 4000
        ? `${file.content.slice(0, 4000)}\n... [truncated]`
        : file.content;
      return `--- ${label} ---\n${body}`;
    });
  return [
    'A deployment failed and must be repaired automatically, without asking a human.',
    '',
    `Project: ${projectId}`,
    `Deployment: ${subdomain}.buildrshq.dev`,
    `Failure stage: ${deployment.failureStage || 'unknown'}`,
    `Error: ${deployment.errorMessage || 'Unknown deployment failure'}`,
    '',
    'Build log tail:',
    logs || '(no build log captured)',
    ...(runtimeLogs ? ['', 'Runtime log tail:', runtimeLogs] : []),
    '',
    'Project files (read them with read_file using the id):',
    buildFileManifest(files),
    ...(previews.length ? ['', 'Relevant file contents (truncated):', ...previews] : []),
    '',
    'Diagnose the root cause in this project and edit the project files to fix it.',
    'Make the smallest correct change. Do not delete files, run tests, or execute code.',
    'Read the relevant files before editing them. When the fix is in place, set goalAchieved=true.',
  ].join('\n');
}

async function runHealingAgent(deployment, { projectId, workspaceId, files = [] }) {
  // Feed the prompt the most relevant file bodies too, so the repair does not
  // depend on the model choosing to read them first. Bounded: a handful of
  // files, 4KB each.
  let previewFiles = [];
  const previewCandidates = pickPreviewFiles(files, deployment);
  if (previewCandidates.length) {
    try {
      previewFiles = await CodeFile.find({
        _id: { $in: previewCandidates.map((file) => file._id) },
      })
        .select('name path content')
        .lean();
    } catch (error) {
      logError('could not load file previews for self-heal', error);
    }
  }

  const execution = await AgentExecution.create({
    userId: deployment.userId,
    projectId,
    taskTitle: `Self-heal failed deployment ${deployment.subdomain}`,
    status: 'running',
    approvalRequired: false,
    metadata: {
      startedFrom: 'deployment-self-heal',
      deploymentId: String(deployment._id),
      workspaceId,
      failureStage: deployment.failureStage || null,
      fault: deployment.fault || null,
    },
  });

  const context = {
    userId: deployment.userId,
    userTier: 'developer',
    workspaceId,
    projectId: String(projectId),
    files: files.map((file) => ({
      id: String(file._id),
      name: file.name,
      path: file.path,
      language: file.language,
    })),
    autonomous: true,
    allowedTools: AUTONOMOUS_TOOLS,
    autoApproveTools: AUTO_APPROVE_TOOLS,
    skipAutoValidation: true,
    maxRuntimeMs: AGENT_TIMEOUT_MS,
  };

  let result;
  try {
    result = await agentOrchestrator.executeAgenticLoop(
      buildHealingGoal(deployment, projectId, files, previewFiles),
      context,
      execution._id
    );
  } catch (error) {
    await AgentExecution.updateOne(
      { _id: execution._id },
      { $set: { status: 'failed', summary: String(error.message || error).slice(0, 1000) } }
    ).catch(() => {});
    throw error;
  }

  const changed = Boolean(
    Array.isArray(result?.iterations)
    && result.iterations.some((iteration) =>
      iteration?.result?.success
      && iteration?.action?.tool
      && CHANGING_TOOLS.has(iteration.action.tool)
    )
  );
  const summary = result?.summary?.finalThought
    || result?.summary?.goal
    || (changed ? 'Agent edited project files.' : 'Agent made no file changes.');

  await AgentExecution.updateOne(
    { _id: execution._id },
    {
      $set: {
        status: (result?.success || changed) ? 'completed' : 'failed',
        summary: String(summary).slice(0, 2000),
        approvalRequired: false,
      },
    }
  ).catch(() => {});

  return {
    // A run that edited files but stopped before declaring the goal achieved
    // may still have fixed the build; let the redeploy decide.
    success: result?.success !== false || changed,
    changed,
    summary,
    error: result?.error || null,
    executionId: execution._id,
  };
}

/**
 * Claim and process one scheduled deployment. The atomic claim makes the
 * poller safe to run on multiple instances.
 */
async function processDeployment(deploymentId) {
  if (!ENABLED) return { skipped: true, reason: 'Self-heal is disabled.' };

  const now = new Date();
  const deployment = await Deployment.findOneAndUpdate(
    {
      _id: deploymentId,
      status: 'failed',
      'selfHeal.status': 'pending',
      'selfHeal.nextAttemptAt': { $lte: now },
      $or: [
        { 'selfHeal.attempts': { $lt: MAX_ATTEMPTS } },
        { 'selfHeal.attempts': { $exists: false } },
        { 'selfHeal.attempts': null },
      ],
    },
    {
      $set: {
        'selfHeal.status': 'running',
        'selfHeal.lastAttemptAt': now,
        'selfHeal.nextAttemptAt': null,
      },
      $inc: { 'selfHeal.attempts': 1 },
    },
    { new: true }
  );

  if (!deployment) return { skipped: true, reason: 'Deployment is not eligible for self-heal.' };

  const projectId = deployment.projectKey
    || (deployment.projectId ? String(deployment.projectId) : null);
  if (!projectId) {
    return markGaveUp(
      deployment,
      'Deployment self-heal skipped: this deployment is not linked to a project.',
      null,
      null
    );
  }

  const files = await CodeFile.find({ project: String(projectId) })
    .select('name path language company')
    .limit(400)
    .lean();

  // Workspace is optional. Prefer the CodeFiles' own company (the scope the
  // agent's file tools use), then the deployment/project workspace, then the
  // owner's personal workspace. Self-heal must never require the user to be in
  // a workspace.
  const workspaces = await resolveRepairWorkspaces(deployment, projectId, files);
  const workspaceId = workspaces[0] || null;

  for (const candidate of workspaces) {
    let company = null;
    try {
      company = await Company.findById(candidate).select('settings.selfHeal').lean();
    } catch (error) {
      logError(`could not read workspace ${candidate}`, error);
    }
    if (company?.settings?.selfHeal === false) {
      return markGaveUp(
        deployment,
        'Deployment self-heal is disabled for this workspace.',
        null,
        candidate,
        { notify: false }
      );
    }
  }

  if (deployment.fault === 'user' && files.length === 0) {
    return markGaveUp(
      deployment,
      'Deployment self-heal stopped: the project has no files to repair.',
      null,
      workspaceId
    );
  }

  if (deployment.fault === 'user' && !workspaceId) {
    return markGaveUp(
      deployment,
      'Deployment self-heal stopped: no workspace is available to scope the repair.',
      null,
      null
    );
  }

  const attempts = Number(deployment.selfHeal?.attempts) || 1;
  notifyDeploymentEvent({
    type: 'deployment_healing',
    deployment: deploymentNotificationTarget(deployment, workspaceId),
    userId: deployment.userId,
    detail: `Attempt ${attempts}/${MAX_ATTEMPTS} to repair ${deployment.subdomain}.buildrshq.dev.`,
  });

  try {
    if (deployment.fault === 'user') {
      const agentResult = await runHealingAgent(deployment, { projectId, workspaceId, files });
      if (!agentResult.success) {
        return await markRetry(
          deployment,
          agentResult.error || 'The repair agent failed to complete.',
          workspaceId
        );
      }
      if (!agentResult.changed) {
        return await markGaveUp(
          deployment,
          'Deployment self-heal stopped: the agent could not identify a safe file change to make.',
          agentResult.summary,
          workspaceId
        );
      }
      await Deployment.updateOne(
        { _id: deployment._id },
        { $set: { 'selfHeal.agentExecutionId': agentResult.executionId } }
      ).catch(() => {});
      await redeployDeployment({
        deployment,
        userId: deployment.userId,
        workspaceId,
        projectId,
        reason: `Redeploying ${deployment.subdomain}.buildrshq.dev after an automatic fix.`,
        preserveSelfHeal: true,
        scheduleOnFailure: false,
        fallbackFault: 'user',
        fallbackStage: deployment.failureStage || 'build',
      });
      return await markSucceeded(
        deployment,
        `Deployment self-heal repaired ${deployment.subdomain}.buildrshq.dev.`,
        workspaceId
      );
    }

    // Platform / transient failure: retry the deploy without an agent edit.
    await redeployDeployment({
      deployment,
      userId: deployment.userId,
      workspaceId,
      projectId,
      reason: `Retrying ${deployment.subdomain}.buildrshq.dev after an infrastructure failure.`,
      preserveSelfHeal: true,
      scheduleOnFailure: false,
      fallbackFault: 'platform',
      fallbackStage: 'platform',
    });
    return await markSucceeded(
      deployment,
      `Deployment self-heal retried ${deployment.subdomain}.buildrshq.dev successfully.`,
      workspaceId
    );
  } catch (error) {
    logError(`attempt ${attempts} for ${deployment.subdomain} failed`, error);
    return await markRetry(deployment, error, workspaceId);
  }
}

/**
 * Enqueue a failed deployment. Safe to call from request handlers; never
 * throws. Resets the attempt budget because this is a new failure event.
 */
async function schedule(deploymentId, { delayMs = 0 } = {}) {
  if (!ENABLED || !deploymentId) return { scheduled: false, reason: 'Self-heal is disabled.' };
  try {
    const result = await Deployment.updateOne(
      {
        _id: deploymentId,
        status: 'failed',
        'selfHeal.status': { $nin: ['pending', 'running', 'succeeded'] },
      },
      {
        $set: {
          'selfHeal.status': 'pending',
          'selfHeal.attempts': 0,
          'selfHeal.lastAttemptAt': null,
          'selfHeal.nextAttemptAt': new Date(Date.now() + delayMs),
          'selfHeal.completedAt': null,
          'selfHeal.agentExecutionId': null,
          'selfHeal.summary': null,
          'selfHeal.lastError': null,
        },
      }
    );
    const modified = result?.modifiedCount ?? result?.n ?? 0;
    return { scheduled: modified > 0 };
  } catch (error) {
    logError('could not schedule deployment', error);
    return { scheduled: false, error: error.message };
  }
}

async function runTick() {
  if (!ENABLED) return { skipped: true, reason: 'Self-heal is disabled.' };
  const now = new Date();

  // A worker that died mid-attempt leaves the row "running" forever. Requeue
  // it after a generous window so a restart can finish the job.
  await Deployment.updateMany(
    {
      'selfHeal.status': 'running',
      'selfHeal.lastAttemptAt': { $lt: new Date(now.getTime() - STALE_RUNNING_MS) },
    },
    { $set: { 'selfHeal.status': 'pending', 'selfHeal.nextAttemptAt': now } }
  );

  // Anything still pending with no attempts left can never be claimed (for
  // example a crash between the final retry and the give-up write).
  await Deployment.updateMany(
    {
      'selfHeal.status': 'pending',
      'selfHeal.attempts': { $gte: MAX_ATTEMPTS },
    },
    {
      $set: {
        'selfHeal.status': 'gave_up',
        'selfHeal.completedAt': now,
        'selfHeal.nextAttemptAt': null,
        'selfHeal.summary': `Deployment self-heal exhausted ${MAX_ATTEMPTS} attempt(s).`,
      },
    }
  );

  // Backstop for failures recorded before the worker started (or by a code
  // path that forgot to schedule): pick up recent untracked failures.
  await Deployment.updateMany(
    {
      status: 'failed',
      fault: { $in: ['user', 'platform'] },
      createdAt: { $gte: new Date(now.getTime() - LOOKBACK_MS) },
      'selfHeal.status': null,
    },
    {
      $set: {
        'selfHeal.status': 'pending',
        'selfHeal.attempts': 0,
        'selfHeal.nextAttemptAt': now,
        'selfHeal.completedAt': null,
        'selfHeal.lastError': null,
      },
    }
  );

  const due = await Deployment.find({
    status: 'failed',
    'selfHeal.status': 'pending',
    'selfHeal.nextAttemptAt': { $lte: now },
  })
    .select('_id')
    .limit(BATCH_SIZE)
    .lean();

  const results = [];
  for (const item of due) {
    results.push(await processDeployment(item._id));
  }
  return { processed: results.length, results };
}

function startSelfHealWorker() {
  if (!ENABLED) {
    console.log('[deploy-self-heal] disabled by DEPLOY_SELF_HEAL_ENABLED');
    return;
  }
  if (timer) return;
  const tick = () => {
    // A previous tick may still be running a long agent/deploy. Never overlap:
    // the next interval will pick up whatever is still due.
    if (activeTick) return;
    activeTick = runTick()
      .catch((error) => logError('worker tick failed', error))
      .finally(() => { activeTick = null; });
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  // Never hold a test process or a shutting-down server open.
  if (timer.unref) timer.unref();
  tick();
}

async function stopSelfHealWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  if (activeTick) await activeTick;
}

module.exports = {
  startSelfHealWorker,
  stopSelfHealWorker,
  schedule,
  runTick,
  processDeployment,
  buildHealingGoal,
  buildFileManifest,
  resolveRepairWorkspaces,
  // exported for tests
  _config: {
    ENABLED,
    POLL_INTERVAL_MS,
    MAX_ATTEMPTS,
    LOOKBACK_MS,
    BACKOFF_BASE_MS,
    BACKOFF_MAX_MS,
    BATCH_SIZE,
    STALE_RUNNING_MS,
    AGENT_TIMEOUT_MS,
    SAFE_TOOLS,
    AUTO_APPROVE_TOOLS,
    AUTONOMOUS_TOOLS,
  },
};
