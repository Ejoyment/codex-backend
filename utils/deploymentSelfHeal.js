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

// The repair prompt is sent to the same model the user's plan uses. Some
// providers cap tokens per minute (Groq's on-demand tier is 8k), so the whole
// request — system prompt, goal, history and max_tokens — has to stay bounded.
// These budgets keep a normal repair prompt around ~4k tokens; the compact
// variant is used after a token-limit failure and relies on read_file instead
// of inlining file bodies.
const MAX_GOAL_CHARS = 15000;
const COMPACT_GOAL_CHARS = 6000;
const AGENT_MAX_TOKENS = 2048;
const TOKEN_LIMIT_PATTERN = 'request too large|tokens per minute|rate_limit_exceeded|context_length_exceeded|maximum context length|too many tokens|reduce your message size';

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

function isTokenLimitError(value) {
  return new RegExp(TOKEN_LIMIT_PATTERN, 'i').test(String(value || ''));
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

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function truncateMiddle(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.35);
  const tail = Math.max(0, maxChars - head - 48);
  const dropped = value.length - head - tail;
  return `${value.slice(0, head)}\n... [${dropped} chars omitted] ...\n${value.slice(-tail)}`;
}

// Docker buildkit prefixes every line with `#<step> <seconds> `. Strip those so
// the model sees the actual compiler/npm message, not timestamps.
function cleanLogLine(line) {
  return stripAnsi(line)
    .replace(/^#\d+\s+[\d.]+\s?/, '')
    .replace(/\s+$/, '');
}

const ERROR_LINE_RE = /(?:^|\b)(?:error|failed|failure|cannot|can't|not found|module not found|does not exist|unable to|exception|fatal|denied|invalid|missing|unresolved|exit code|ERR!|ERESOLVE|ENOENT|EACCES|TS\d{3,5}|webpack|did not complete successfully)(?:\b|$)/i;

// Pull the lines that actually explain the failure out of the (sometimes very
// long) build log. A plain tail can miss the compiler error entirely when npm
// keeps printing deprecation warnings after it.
function buildErrorDigest(deployment = {}, maxChars = 3500) {
  const raw = stripAnsi([
    deployment.errorMessage,
    deployment.buildLogs,
    deployment.runtimeLogs,
  ].filter(Boolean).join('\n'));
  if (!raw.trim()) return '(no build or runtime log was captured)';

  const lines = raw.split('\n');
  const picked = [];
  const seen = new Set();
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!ERROR_LINE_RE.test(lines[i])) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
      if (seen.has(j)) continue;
      const line = cleanLogLine(lines[j]);
      if (!line) continue;
      seen.add(j);
      picked.push(line);
      used += line.length + 1;
    }
    if (used >= maxChars) break;
  }

  const digest = picked.length ? picked.join('\n') : truncateMiddle(raw, maxChars);
  return truncateMiddle(digest, maxChars);
}

// Turn the common build failures into concrete repair instructions. This is
// generic (not tied to one project): it only points at what the log says.
function buildRepairHints(digest = '') {
  const text = String(digest || '');
  const hints = [];
  const missing = [];
  const missingRe = /(?:Module not found:\s*Can't resolve|Cannot find module)\s*['"]?([^'"\s]+)['"]?/gi;
  let match;
  while ((match = missingRe.exec(text)) !== null) missing.push(match[1]);
  for (const target of [...new Set(missing)].slice(0, 4)) {
    if (target.startsWith('.') || target.startsWith('/')) {
      hints.push(`Create the missing file "${target}" (or correct the import) so the referenced path exists.`);
    } else {
      hints.push(`The build cannot resolve the package "${target}". Add it to package.json or fix the import.`);
    }
  }
  if (/only works in a Client Component|needs (?:useEffect|useState|useReducer|useRef|useContext|useMemo|useCallback|useLayoutEffect)/i.test(text)) {
    hints.push('Add "use client"; as the first line of the App Router file that uses client-only hooks (and of any component it imports that also uses them).');
  }
  if (/ERESOLVE|peer dep|Could not resolve dependency|conflicting peer/i.test(text)) {
    hints.push('Resolve the dependency conflict in package.json by aligning the incompatible versions.');
  }
  if (/error TS\d+|Type error:/i.test(text)) {
    hints.push('Fix the reported TypeScript type error in the named file.');
  }
  if (/ENOENT|no such file or directory/i.test(text)) {
    hints.push('Create the file or directory the build says is missing.');
  }
  return [...new Set(hints)].slice(0, 6);
}

function buildFileManifest(files = [], maxChars = 2200) {
  if (!files.length) return '(no project files were found for this deployment)';
  const lines = [];
  let used = 0;
  for (let i = 0; i < files.length && i < 200; i++) {
    const file = files[i];
    const dir = file.path && file.path !== '/' ? String(file.path).replace(/\/+$/, '') : '';
    const name = `${dir ? `${dir}/` : ''}${file.name}`;
    const line = `- ${name} (id: ${file._id})`;
    if (used + line.length + 1 > maxChars) {
      lines.push(`- ... ${files.length - i} more file(s); use list_files to see the rest.`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

const ENTRY_FILE_NAMES = new Set([
  'package.json', 'dockerfile', 'index.js', 'server.js', 'app.js', 'main.js',
  'main.py', 'requirements.txt', 'pyproject.toml', 'go.mod', 'go.sum',
  'gemfile', 'composer.json', 'nginx.conf', '.env.example', 'vite.config.js',
  'next.config.js', 'tsconfig.json',
]);

// Pick a handful of files whose contents are worth putting directly in the
// repair prompt: files named in the build error first, then common entrypoints.
function pickPreviewFiles(files = [], deployment = {}, digest = '') {
  const haystack = `${deployment?.errorMessage || ''}\n${deployment?.buildLogs || ''}\n${digest}`.toLowerCase();
  return files
    .map((file) => {
      const name = String(file.name || '').toLowerCase();
      const path = String(file.path || '').toLowerCase();
      let score = 0;
      if (name && haystack.includes(name)) score += 10;
      if (path && path !== '/' && haystack.includes(path)) score += 4;
      if (ENTRY_FILE_NAMES.has(name)) score += 5;
      return { file, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ file }) => file);
}

function buildHealingGoal(deployment, projectId, files = [], previewFiles = [], options = {}) {
  const compact = options.compact === true;
  const budget = compact ? COMPACT_GOAL_CHARS : MAX_GOAL_CHARS;
  const subdomain = deployment.subdomain;
  let digestText = buildErrorDigest(deployment, compact ? 2200 : 3500);
  const hints = buildRepairHints(digestText);
  const logTail = compact ? '' : truncateMiddle(stripAnsi(deployment.buildLogs || ''), 1800);
  const manifest = buildFileManifest(files, compact ? 1600 : 2200);
  const previews = (compact ? [] : previewFiles)
    .filter((file) => typeof file.content === 'string' && file.content.length)
    .slice(0, 3)
    .map((file) => {
      const dir = file.path && file.path !== '/' ? String(file.path).replace(/\/+$/, '') : '';
      const label = `${dir ? `${dir}/` : ''}${file.name}`;
      const body = file.content.length > 2000
        ? `${file.content.slice(0, 2000)}\n... [preview truncated; call read_file with id ${file._id} for the full file]`
        : file.content;
      return `--- ${label} (id: ${file._id}) ---\n${body}`;
    });

  let includeTail = Boolean(logTail);
  let includePreviews = previews.length > 0;

  const render = () => {
    const header = [
      'A deployment failed and must be repaired automatically, without asking a human.',
      '',
      `Project: ${projectId}`,
      `Deployment: ${subdomain}.buildrshq.dev`,
      `Failure stage: ${deployment.failureStage || 'unknown'}`,
      `Error: ${truncateMiddle(deployment.errorMessage || 'Unknown deployment failure', compact ? 600 : 1200)}`,
    ];
    const digestSection = ['What the build log says:', digestText];
    const tailSection = includeTail ? ['Build log tail (the failing step):', logTail] : [];
    const hintsSection = hints.length ? ['Repair hints derived from the log:', ...hints.map((hint) => `- ${hint}`)] : [];
    const manifestSection = ['Project files (read with read_file using the id):', manifest];
    const previewSection = includePreviews
      ? ['Relevant file contents (previews; call read_file for the full file):', ...previews]
      : [];
    const instructions = [
      'You must make at least one file change. This is an automatic repair run with no human to approve, clarify, or run commands.',
      'Use read_file to inspect the full file, then update_file with the complete corrected content, or create_file for a missing file.',
      'create_file parameters: name, path, language, content. update_file parameters: fileId, content.',
      'If the log names a missing file, create it. If a component uses hooks in the Next.js app router, add "use client";. If a dependency is missing, add it to package.json.',
      'Do not delete files, run tests, or execute code. The deployment is redeployed automatically after your edit.',
      'When the fix is in place, set goalAchieved=true. Do not set goalAchieved=true before you have changed a file.',
    ];
    return [header, digestSection, tailSection, hintsSection, manifestSection, previewSection, instructions]
      .map((section) => (Array.isArray(section) ? section.join('\n') : section))
      .filter(Boolean)
      .join('\n\n');
  };

  let goal = render();
  if (goal.length > budget && includePreviews) {
    includePreviews = false;
    goal = render();
  }
  if (goal.length > budget && includeTail) {
    includeTail = false;
    goal = render();
  }
  if (goal.length > budget) {
    digestText = truncateMiddle(digestText, Math.max(600, digestText.length - (goal.length - budget)));
    goal = render();
  }
  if (goal.length > budget) goal = truncateMiddle(goal, budget);
  return goal;
}

async function runHealingAgent(deployment, { projectId, workspaceId, files = [], compact = false }) {
  // Feed the prompt the most relevant file bodies too, so the repair does not
  // depend on the model choosing to read them first. Bounded: a few files,
  // 2KB each. Compact runs skip previews and rely on read_file.
  let previewFiles = [];
  const digest = buildErrorDigest(deployment);
  const previewCandidates = compact ? [] : pickPreviewFiles(files, deployment, digest);
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
    requireMutation: true,
    agentMaxTokens: AGENT_MAX_TOKENS,
    allowedTools: AUTONOMOUS_TOOLS,
    autoApproveTools: AUTO_APPROVE_TOOLS,
    skipAutoValidation: true,
    maxRuntimeMs: AGENT_TIMEOUT_MS,
  };

  let result;
  try {
    result = await agentOrchestrator.executeAgenticLoop(
      buildHealingGoal(deployment, projectId, files, previewFiles, { compact }),
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
  // A previous attempt may have been rejected by the provider because the
  // prompt was too large. Keep the retry under the token budget and let the
  // agent read files with read_file instead of inlining previews.
  const compact = isTokenLimitError(deployment.selfHeal?.lastError);
  notifyDeploymentEvent({
    type: 'deployment_healing',
    deployment: deploymentNotificationTarget(deployment, workspaceId),
    userId: deployment.userId,
    detail: `Attempt ${attempts}/${MAX_ATTEMPTS} to repair ${deployment.subdomain}.buildrshq.dev.`,
  });

  try {
    if (deployment.fault === 'user') {
      const agentResult = await runHealingAgent(deployment, { projectId, workspaceId, files, compact });
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
          'selfHeal.recoveredAt': null,
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

  // A pending run whose last attempt was rejected by the provider for size is
  // given one fresh budget. The next attempt uses the compact prompt, so this
  // is not a retry of the same oversized request. recoveredAt makes it
  // one-shot.
  await Deployment.updateMany(
    {
      status: 'failed',
      'selfHeal.status': 'pending',
      'selfHeal.lastError': { $regex: TOKEN_LIMIT_PATTERN, $options: 'i' },
      'selfHeal.recoveredAt': null,
    },
    {
      $set: {
        'selfHeal.attempts': 0,
        'selfHeal.nextAttemptAt': now,
        'selfHeal.recoveredAt': now,
      },
    }
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

  // One-shot recovery for runs the old code gave up on:
  //   - the old resolver required a workspace, and
  //   - the first prompt versions could exceed the provider's token limit.
  // recoveredAt prevents a row from being requeued again if the new attempt
  // still fails.
  await Deployment.updateMany(
    {
      'selfHeal.status': 'gave_up',
      'selfHeal.recoveredAt': null,
      $or: [
        { 'selfHeal.summary': { $regex: 'no resolvable workspace', $options: 'i' } },
        { 'selfHeal.lastError': { $regex: TOKEN_LIMIT_PATTERN, $options: 'i' } },
      ],
      createdAt: { $gte: new Date(now.getTime() - LOOKBACK_MS) },
    },
    {
      $set: {
        'selfHeal.status': 'pending',
        'selfHeal.attempts': 0,
        'selfHeal.nextAttemptAt': now,
        'selfHeal.completedAt': null,
        'selfHeal.recoveredAt': now,
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
  buildErrorDigest,
  buildRepairHints,
  buildFileManifest,
  resolveRepairWorkspaces,
  isTokenLimitError,
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
    MAX_GOAL_CHARS,
    COMPACT_GOAL_CHARS,
    AGENT_MAX_TOKENS,
    SAFE_TOOLS,
    AUTO_APPROVE_TOOLS,
    AUTONOMOUS_TOOLS,
  },
};
