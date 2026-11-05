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
const { detectRuntime } = require('./deploymentService');
const { normalizeEnv, toObject } = require('./deployEnv');
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
// These budgets keep a repair prompt under the provider limit. Groq's
// on-demand tier is 8k tokens per minute (TPM), and the request counts both
// the prompt and the requested max_tokens against that window. The compact
// variant is the default for self-heal: it skips file previews and relies on
// read_file instead of inlining bodies, which is what keeps a repair under
// the limit on the first attempt.
const MAX_GOAL_CHARS = readInt('DEPLOY_SELF_HEAL_MAX_GOAL_CHARS', 8000);
const COMPACT_GOAL_CHARS = readInt('DEPLOY_SELF_HEAL_COMPACT_GOAL_CHARS', 4000);
const AGENT_MAX_TOKENS = readInt('DEPLOY_SELF_HEAL_AGENT_MAX_TOKENS', 512);
// Groq (and several other providers) reset their per-minute token window on
// a whole-minute boundary. A token-limit retry should not fire until that
// window has had a chance to clear, otherwise it is rejected again.
const TOKEN_LIMIT_BACKOFF_MS = readInt('DEPLOY_SELF_HEAL_TOKEN_LIMIT_BACKOFF_MS', 65000);
const TOKEN_LIMIT_PATTERN = 'request too large|tokens per minute|rate_limit_exceeded|context_length_exceeded|maximum context length|too many tokens|reduce your message size';
// A rejected/absent provider key is not a code problem and retrying it just
// burns the repair budget. Surface it to the user instead.
const PROVIDER_CONFIG_PATTERN = 'invalid api key|incorrect api key|invalid_api_key|unauthorized|authentication failed|no ai providers configured|is selected but not configured';

// Autonomous repairs may read broadly, but only create/update/edit files.
// Deleting source or executing arbitrary code needs a human, and would
// otherwise stall forever on the HITL gate because there is no one watching
// the background run. edit_file is included so large files can be fixed
// without rewriting the whole file (and without relying on a full-file read
// fitting in the prompt).
const SAFE_TOOLS = [
  'read_file',
  'list_files',
  'search_code',
  'analyze_code',
];
const AUTO_APPROVE_TOOLS = ['create_file', 'update_file', 'edit_file', 'create_multiple_files', 'set_env', 'declare_env_vars'];
const AUTONOMOUS_TOOLS = [...SAFE_TOOLS, ...AUTO_APPROVE_TOOLS];
const CHANGING_TOOLS = new Set(AUTO_APPROVE_TOOLS.filter((tool) => tool !== 'declare_env_vars'));

let timer = null;
let activeTick = null;

function logError(context, error) {
  console.error(`[deploy-self-heal] ${context}:`, error?.message || error);
}

function isTokenLimitError(value) {
  return new RegExp(TOKEN_LIMIT_PATTERN, 'i').test(String(value || ''));
}

function isProviderConfigError(value) {
  return new RegExp(PROVIDER_CONFIG_PATTERN, 'i').test(String(value || ''));
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
        'selfHeal.progress': summary,
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
        'selfHeal.progress': summary,
        'selfHeal.lastError': null,
        'selfHeal.requiredEnv': [],
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

  // A provider token-limit rejection (Groq's 8k TPM on-demand tier) resets on
  // a whole-minute boundary. Retrying immediately just burns another attempt
  // on a request that cannot succeed, so wait past the window before retrying.
  const delay = isTokenLimitError(message) ? TOKEN_LIMIT_BACKOFF_MS : backoffFor(attempts);
  const nextAttemptAt = new Date(Date.now() + delay);
  const summary = `Attempt ${attempts}/${MAX_ATTEMPTS} failed: ${message}`;
  await Deployment.updateOne(
    { _id: deployment._id, 'selfHeal.status': 'running' },
    {
      $set: {
        'selfHeal.status': 'pending',
        'selfHeal.nextAttemptAt': nextAttemptAt,
        'selfHeal.lastError': message,
        'selfHeal.summary': summary,
        'selfHeal.progress': `${summary}. Retrying automatically.`,
      },
    }
  );
  notifyDeploymentEvent({
    type: 'deployment_healing',
    deployment: deploymentNotificationTarget(deployment, workspaceId),
    userId: deployment.userId,
    detail: `${summary}. Retrying automatically.`,
  });
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

// The deployment error message often embeds an `ls -l` of the build context.
// Those lines are noise: the manifest already tells the agent which files
// exist, and the listing otherwise crowds the real compiler error out of the
// prompt budget.
function stripContextListing(text) {
  return String(text || '').replace(/\s*(?:Context contents|Repo root):[\s\S]*$/i, '');
}

function isNoiseLogLine(line) {
  const value = String(line || '').trim();
  if (!value) return true;
  if (/^total\s+\d+$/i.test(value)) return true;
  if (/^[d-][rwx-]{9}[.+@]?\s+\d+\s+/.test(value)) return true;
  if (/^l[rwx-]{9}[.+@]?\s+\d+\s+/.test(value)) return true;
  if (/Context contents:/i.test(value)) return true;
  return false;
}

// Truncate on a line boundary. Cutting in the middle of a compiler line can
// remove the exact phrase the repair depends on (for example Next.js's "only
// works in a client component" tail).
function truncateLogLines(text, maxChars) {
  const lines = String(text || '').split('\n');
  const kept = [];
  let used = 0;
  for (const line of lines) {
    const capped = line.length > 600 ? `${line.slice(0, 600)}…` : line;
    if (used + capped.length + 1 > maxChars) break;
    kept.push(capped);
    used += capped.length + 1;
  }
  if (kept.length < lines.length) {
    kept.push(`... [${lines.length - kept.length} more log line(s) omitted]`);
  }
  return kept.join('\n');
}

// The deployment error string can embed the same `ls -l` context listing as
// the build log. Strip it before it reaches the prompt header.
function sanitizeErrorText(text, maxChars) {
  const lines = stripAnsi(stripContextListing(text))
    .split('\n')
    .map((line) => cleanLogLine(line))
    .filter((line) => line && !isNoiseLogLine(line));
  return truncateLogLines(lines.join('\n'), maxChars);
}

// Build failures are not language-specific. Match the shapes emitted by the
// common toolchains (Node, Python, Go, Rust, Java, .NET, Ruby, PHP, Swift,
// Dart, Elixir, C/C++), Docker/BuildKit, shells, and package managers.
const ERROR_LINE_PATTERNS = [
  /\b(?:error|failed|failure|fatal|exception|panic|denied|invalid|missing|unresolved|unable to|cannot|can't|not found|does not exist)\b/i,
  /\b(?:ERR!|ERESOLVE|ENOENT|EACCES|EPERM|EADDRINUSE|EBADENGINE|MODULE_NOT_FOUND|ELIFECYCLE)\b/,
  /(?:ModuleNotFound|Import|Syntax|Indentation|Attribute|Type|Value|Key|Name|OS|Runtime|Permission|Assertion)Error/,
  /Traceback \(most recent call last\)/i,
  /No module named/i,
  /error\[E\d+\]/i,
  /cannot find symbol/i,
  /\bCS\d{4}\b/,
  /Undefined symbols?|linker command failed/i,
  /Segmentation fault|\bKilled\b|out of memory|OOMKilled/i,
  /(?:^|\s)[^\s:]+\.(?:go|rs|java|cs|py|rb|php|swift|kt|kts|dart|ex|exs|c|cc|cpp|h|hpp|ts|tsx|js|jsx|mjs|cjs):\d+(?::\d+)?/i,
  /at .+\(.+:\d+:\d+\)/,
  /\b(?:BUILD FAILED|FAILED|exit code|exited with|command not found|not found:)\b/i,
  /(?:npm|yarn|pnpm) ERR!/i,
  /(?:failed to solve|failed to compute cache key|exec format error|no such file or directory)/i,
  /(?:unsupported engine|requires node|requires python|requires go|requires java)/i,
  /(?:GLIBC|libstdc\+\+|libc\.so|error while loading shared libraries)/i,
];

function isErrorLine(line) {
  return errorLineScore(line) > 0;
}

// A generic word like "missing" is a weak signal; a file:line or a known
// compiler/runtime signature is a strong one. Ranking strong lines first means
// a wall of npm warnings cannot push the real error out of the digest.
const STRONG_ERROR_PATTERNS = [
  /Traceback \(most recent call last\)/i,
  /ModuleNotFoundError|ImportError|No module named/i,
  /error\[E\d+\]/i,
  /cannot find symbol/i,
  /\bCS\d{4}\b/,
  /(?:^|\s)[^\s:]+\.(?:go|rs|java|cs|py|rb|php|swift|kt|kts|dart|ex|exs|c|cc|cpp|h|hpp|ts|tsx|js|jsx|mjs|cjs):\d+(?::\d+)?/i,
  /Module not found|Cannot find module|MODULE_NOT_FOUND/i,
  /failed to solve|failed to compute cache key/i,
  /(?:npm|yarn|pnpm) ERR!/i,
  /\bexit code\b|\bexited with\b/i,
  /\bpanic:|\bfatal(?: error)?:/i,
  /\b(?:BUILD FAILED|FAILED)\b/,
  /error TS\d+/i,
];

function errorLineScore(line) {
  const value = String(line || '');
  if (!value.trim()) return 0;
  if (STRONG_ERROR_PATTERNS.some((pattern) => pattern.test(value))) return 3;
  if (ERROR_LINE_PATTERNS.some((pattern) => pattern.test(value))) return 1;
  return 0;
}

// Pull the lines that actually explain the failure out of the (sometimes very
// long) build log. A plain tail can miss the compiler error entirely when npm
// keeps printing deprecation warnings after it.
function buildErrorDigest(deployment = {}, maxChars = 3500) {
  const raw = stripAnsi([
    stripContextListing(deployment.errorMessage),
    deployment.buildLogs,
    deployment.runtimeLogs,
  ].filter(Boolean).join('\n'));
  if (!raw.trim()) return '(no build or runtime log was captured)';

  const lines = raw.split('\n');
  const candidates = [];
  const seenLines = new Set();
  for (let i = 0; i < lines.length; i++) {
    const cleaned = cleanLogLine(lines[i]);
    if (isNoiseLogLine(cleaned)) continue;
    const score = errorLineScore(cleaned);
    if (score > 0) candidates.push({ index: i, score, cleaned });
  }
  candidates.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  const chosen = new Set();
  let used = 0;
  for (const { index } of candidates) {
    for (let j = Math.max(0, index - 1); j <= Math.min(lines.length - 1, index + 1); j++) {
      if (chosen.has(j)) continue;
      const line = cleanLogLine(lines[j]);
      if (isNoiseLogLine(line)) continue;
      if (seenLines.has(line)) continue;
      seenLines.add(line);
      chosen.add(j);
      used += line.length + 1;
    }
    if (used >= maxChars) break;
  }

  const picked = [...chosen]
    .sort((a, b) => a - b)
    .map((index) => cleanLogLine(lines[index]))
    .filter((line) => line && !isNoiseLogLine(line));
  const digest = picked.length
    ? picked.join('\n')
    : truncateLogLines(raw.split('\n').filter((line) => !isNoiseLogLine(line)).join('\n'), maxChars);
  return truncateLogLines(digest, maxChars);
}

const MANIFEST_LABELS = {
  'package.json': 'JavaScript/TypeScript dependencies',
  'requirements.txt': 'Python dependencies',
  'pyproject.toml': 'Python dependencies',
  'pipfile': 'Python dependencies',
  'poetry.lock': 'Python dependencies',
  'go.mod': 'Go modules',
  'go.sum': 'Go modules',
  'cargo.toml': 'Rust dependencies',
  'cargo.lock': 'Rust dependencies',
  'pom.xml': 'Java/Maven dependencies',
  'build.gradle': 'Java/Gradle dependencies',
  'build.gradle.kts': 'Java/Gradle dependencies',
  'settings.gradle': 'Java/Gradle build',
  'settings.gradle.kts': 'Java/Gradle build',
  'gemfile': 'Ruby gems',
  'gemfile.lock': 'Ruby gems',
  'composer.json': 'PHP dependencies',
  'composer.lock': 'PHP dependencies',
  'pubspec.yaml': 'Dart/Flutter dependencies',
  'pubspec.lock': 'Dart/Flutter dependencies',
  'mix.exs': 'Elixir dependencies',
  'mix.lock': 'Elixir dependencies',
  'package.swift': 'Swift dependencies',
  'cmakelists.txt': 'C/C++ build',
  'makefile': 'C/C++ build',
  'dockerfile': 'container build',
  'docker-compose.yml': 'container orchestration',
};

function detectManifests(files = []) {
  const found = [];
  const seen = new Set();
  for (const file of files) {
    const name = String(file?.name || '').toLowerCase();
    if (!MANIFEST_LABELS[name] || seen.has(name)) continue;
    seen.add(name);
    found.push(`${name} (${MANIFEST_LABELS[name]})`);
  }
  return found;
}

function dependencyManifestFor(files = []) {
  const names = new Set(files.map((file) => String(file?.name || '').toLowerCase()));
  const order = [
    'package.json', 'requirements.txt', 'pyproject.toml', 'pipfile',
    'go.mod', 'cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts',
    'gemfile', 'composer.json', 'pubspec.yaml', 'mix.exs', 'package.swift',
  ];
  return order.find((name) => names.has(name)) || null;
}

// Resolve a relative import ("./globals.css") against the file that imported
// it ("./app/layout.tsx") so the agent creates the file in the right directory.
const SOURCE_FILE_RE = /((?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.(?:[cm]?[jt]sx?|css|scss|sass|less|vue|svelte|py|go|rs|java|kt|kts|cs|rb|php|dart|ex|exs|swift|c|cc|cpp|h|hpp|json|ya?ml|toml|html|md|sql|sh))/i;

function importerBefore(text, index) {
  const before = String(text || '').slice(0, Math.max(0, index));
  const lines = before.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(SOURCE_FILE_RE);
    if (match) return match[1].replace(/^\.\//, '');
  }
  return null;
}

function resolveRelativeTarget(target, importerRel) {
  if (!importerRel || !target.startsWith('.')) return target;
  const baseDir = importerRel.includes('/')
    ? importerRel.slice(0, importerRel.lastIndexOf('/'))
    : '';
  const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/') || target;
}

// Turn the common build failures into concrete repair instructions. This is
// generic (not tied to one project or stack): it only points at what the log
// says and which manifest the project actually has.
function buildRepairHints(digest = '', files = []) {
  const text = String(digest || '');
  const hints = [];
  const add = (pattern, hint) => {
    if (pattern.test(text)) hints.push(hint);
  };
  const manifest = dependencyManifestFor(files);

  const missing = [];
  const missingRe = /(?:Module not found:\s*Can't resolve|Cannot find module|No module named|Could not find (?:gem|package|module))\s*['"]?([^'"\s]+)['"]?/gi;
  let match;
  while ((match = missingRe.exec(text)) !== null) {
    missing.push({ target: match[1], index: match.index });
  }
  const seenTargets = new Set();
  for (const { target, index } of missing) {
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    if (seenTargets.size > 4) break;
    if (target.startsWith('.') || target.startsWith('/')) {
      const importer = importerBefore(text, index);
      const resolved = resolveRelativeTarget(target, importer);
      if (resolved !== target) {
        hints.push(`Create the missing file "${resolved}" (imported as "${target}" by ${importer}) so the referenced path exists.`);
      } else {
        hints.push(`Create the missing file "${target}" (or correct the import) so the referenced path exists.`);
      }
    } else {
      hints.push(`The build cannot resolve "${target}". Add it to ${manifest || 'the dependency manifest'} or fix the import.`);
    }
  }

  add(/only works in a Client Component|needs (?:useEffect|useState|useReducer|useRef|useContext|useMemo|useCallback|useLayoutEffect)/i,
    'Add "use client"; as the first line of the App Router file that uses client-only hooks (and of any component it imports that also uses them).');
  add(/ERESOLVE|peer dep|Could not resolve dependency|conflicting peer/i,
    'Resolve the dependency conflict in package.json by aligning the incompatible versions.');
  add(/error TS\d+|Type error:/i,
    'Fix the reported TypeScript type error in the named file.');
  add(/ENOENT|no such file or directory/i,
    'Create the file or directory the build says is missing.');
  add(/Traceback \(most recent call last\)|ModuleNotFoundError|ImportError|No module named/i,
    `A Python import failed. Add the module to ${manifest || 'requirements.txt'} or fix the import path.`);
  add(/\bundefined:|cannot find package|missing go\.sum entry|go: (?:updates|downloading)/i,
    'Fix the Go compile error (undefined symbol or import); make go.mod/go.sum match the imports.');
  add(/error\[E\d+\]|unresolved import|cannot find crate/i,
    'Fix the Rust compile error; add the missing crate to Cargo.toml if the import is valid.');
  add(/cannot find symbol|package .* does not exist|Could not resolve dependencies/i,
    `Fix the Java compile/dependency error; add the missing dependency to ${manifest || 'pom.xml or build.gradle'}.`);
  add(/\bCS\d{4}\b|The type or namespace name .* could not be found/i,
    'Fix the .NET compile error; add the missing package reference to the .csproj.');
  add(/Could not find .* in any of the sources|cannot load such file/i,
    'Add the missing gem to Gemfile (or fix the require path) so bundle install can resolve it.');
  add(/Class .* not found|Your requirements could not be resolved|composer.*(?:error|failed)/i,
    'Fix the PHP dependency/autoload error in composer.json or the require path.');
  add(/Because .* depends on|pub get failed|Could not resolve/i,
    'Resolve the Dart/Flutter dependency in pubspec.yaml.');
  add(/EADDRINUSE|address already in use|listen EADDRINUSE/i,
    'Bind the server to 0.0.0.0 and the port from the PORT environment variable; do not hardcode a port.');
  add(/EACCES|EPERM|permission denied/i,
    'Fix the permission/ownership error; the container runs as a non-root user, so chmod/chown the path or write to a writable location.');
  add(/out of memory|OOMKilled|heap out of memory|\bKilled\b/i,
    'The build ran out of memory. Reduce build concurrency/heap usage or remove unnecessary build steps.');
  add(/failed to solve|failed to compute cache key|exec format error|no such file or directory/i,
    'Inspect the Dockerfile and the failing COPY/RUN step; fix the path, base image, or command it names.');
  add(/GLIBC|libstdc\+\+|libc\.so|error while loading shared libraries/i,
    'The runtime image is missing a system library or uses an incompatible libc; switch to a compatible base image or install the library in the Dockerfile.');
  add(/missing (?:required )?environment variable|process\.env\.[A-Z0-9_]+ is undefined|KeyError/i,
    'A required environment variable is missing. Make the code tolerate an unset value or read it from the environment; do not hardcode secrets.');
  add(/SyntaxError|IndentationError|unexpected token|Expected .* found/i,
    'Fix the syntax error in the file and line named by the log.');
  add(/unsupported engine|EBADENGINE|requires node|requires python|requires go|requires java/i,
    'Align the runtime version in the project manifest/Dockerfile with the version the toolchain requires.');

  return [...new Set(hints)].slice(0, 6);
}

function buildFileManifest(files = [], maxChars = 4000) {
  if (!files.length) return '(no project files were found for this deployment)';
  const lines = [];
  let used = 0;
  for (let i = 0; i < files.length && i < 400; i++) {
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

function fileRelPath(file) {
  const dir = String(file?.path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const name = String(file?.name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!dir) return name;
  if (dir === name || dir.endsWith('/' + name)) return dir;
  return `${dir}/${name}`;
}

// Match the file paths a compiler names in the log against the project's files
// so the prompt can point the agent at the exact file ids to read first.
function failingFilesFromDigest(digest, files = []) {
  const haystack = String(digest || '').toLowerCase();
  if (!haystack) return [];
  const found = [];
  const seen = new Set();
  for (const file of files) {
    const rel = fileRelPath(file);
    const lower = rel.toLowerCase();
    if (!lower) continue;
    const base = lower.split('/').pop();
    // A bare basename is only a signal when it is specific enough; otherwise
    // every "index.js" in a monorepo would match.
    const matched = haystack.includes(lower)
      || (base.length >= 6 && haystack.includes(base));
    if (!matched || seen.has(lower)) continue;
    seen.add(lower);
    found.push({ file, rel });
  }
  return found.slice(0, 6);
}

const ENTRY_FILE_NAMES = new Set([
  // Node/JS/TS
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'index.js', 'server.js', 'app.js', 'main.js', 'index.ts', 'server.ts',
  'vite.config.js', 'next.config.js', 'nuxt.config.js', 'tsconfig.json',
  // Python
  'main.py', 'app.py', 'manage.py', 'requirements.txt', 'pyproject.toml',
  'pipfile', 'setup.py', 'setup.cfg',
  // Go / Rust / JVM / .NET
  'go.mod', 'go.sum', 'cargo.toml', 'cargo.lock', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  // Ruby / PHP / Dart / Elixir / Swift / C/C++
  'gemfile', 'gemfile.lock', 'composer.json', 'composer.lock', 'pubspec.yaml',
  'mix.exs', 'package.swift', 'cmakelists.txt', 'makefile',
  // Containers / serving
  'dockerfile', 'docker-compose.yml', '.dockerignore', 'nginx.conf',
  '.env.example', 'procfile',
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
    .slice(0, 5)
    .map(({ file }) => file);
}

function buildHealingGoal(deployment, projectId, files = [], previewFiles = [], options = {}) {
  const compact = options.compact === true;
  const budget = compact ? COMPACT_GOAL_CHARS : MAX_GOAL_CHARS;
  const subdomain = deployment.subdomain;
  let digestText = buildErrorDigest(deployment, compact ? 3200 : 5000);
  const hints = buildRepairHints(digestText, files);
  const manifests = detectManifests(files);
  const failingFiles = failingFilesFromDigest(digestText, files);
  // The platform persists the runtime it detected before building. Use that
  // instead of re-detecting from a metadata-only file list (which cannot see
  // package.json scripts and would report "static" for a Node app).
  let runtime = options.runtime || null;
  if (!runtime) {
    try {
      runtime = detectRuntime(files)?.runtime || null;
    } catch (error) {
      logError('could not detect runtime for self-heal prompt', error);
    }
  }
  const logTail = compact ? '' : truncateLogLines(
    stripAnsi(deployment.buildLogs || '')
      .split('\n')
      .filter((line) => !isNoiseLogLine(line))
      .join('\n'),
    3500
  );
  const runtimeLogs = compact ? '' : truncateLogLines(
    stripAnsi(deployment.runtimeLogs || '')
      .split('\n')
      .filter((line) => !isNoiseLogLine(line))
      .join('\n'),
    4000
  );
  const manifest = buildFileManifest(files, compact ? 2400 : 4000);
  const previews = (compact ? [] : previewFiles)
    .filter((file) => typeof file.content === 'string' && file.content.length)
    .slice(0, 4)
    .map((file) => {
      const dir = file.path && file.path !== '/' ? String(file.path).replace(/\/+$/, '') : '';
      const label = `${dir ? `${dir}/` : ''}${file.name}`;
      const body = file.content.length > 2000
        ? `${file.content.slice(0, 2000)}\n... [preview truncated; call read_file with id ${file._id} and use offset/limit for the rest]`
        : file.content;
      return `--- ${label} (id: ${file._id}) ---\n${body}`;
    });

  let includeTail = Boolean(logTail);
  let includeRuntime = Boolean(runtimeLogs);
  let includePreviews = previews.length > 0;

  const render = () => {
    const header = [
      'A deployment failed and must be repaired automatically, without asking a human.',
      'The project may use any language, framework, or build system. Do not assume Node or Next.js; read the manifests and the files named in the log first.',
      '',
      `Project: ${projectId}`,
      `Deployment: ${subdomain}.buildrshq.dev`,
      `Failure stage: ${deployment.failureStage || 'unknown'}`,
      runtime ? `Detected runtime: ${runtime}` : '',
      `Error: ${sanitizeErrorText(deployment.errorMessage || 'Unknown deployment failure', compact ? 500 : 800)}`,
    ].filter(Boolean);
    const manifestsSection = manifests.length
      ? ['Detected project manifests:', ...manifests.map((item) => `- ${item}`)]
      : [];
    const failingSection = failingFiles.length
      ? [
        'Files named in the log (read these first with read_file):',
        ...failingFiles.map(({ file, rel }) => `- ${rel} (id: ${file._id})`),
      ]
      : [];
    const digestSection = ['What the build log says:', digestText];
    const tailSection = includeTail ? ['Build log tail (the failing step):', logTail] : [];
    const runtimeSection = includeRuntime
      ? ['Runtime logs (the container\'s stdout/stderr after starting):', runtimeLogs]
      : [];
    const hintsSection = hints.length ? ['Repair hints derived from the log:', ...hints.map((hint) => `- ${hint}`)] : [];
    const manifestSection = ['Project files (read with read_file using the id):', manifest];
    const previewSection = includePreviews
      ? ['Relevant file contents (previews; call read_file for the full file):', ...previews]
      : [];
    const instructions = [
      'You must make at least one file change. This is an automatic repair run with no human to approve, clarify, or run commands.',
      'Read the files named in the log first. For a small fix, call edit_file with exact oldText/newText (set replaceAll=true if the same text repeats). For a missing file, call create_file. Use update_file only when you have the complete corrected file.',
      'edit_file parameters: fileId, oldText, newText, replaceAll. create_file parameters: name, path, language, content. update_file parameters: fileId, content.',
      'If the log names a missing file, create it. If a dependency is missing, add it to the manifest that this project actually has (package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, pom.xml, build.gradle, Gemfile, composer.json, pubspec.yaml, mix.exs, or the Dockerfile).',
      'If the project uses a Dockerfile, fix the failing COPY/RUN/CMD step or the base image. If it does not, fix the source so the detected runtime can build it.',
      'If the detected runtime does not match the project (for example a Java, Rust, .NET, Elixir, or C/C++ project detected as static) or the log shows the platform cannot build this stack, create a correct Dockerfile that installs the toolchain, builds the project, and runs it on the PORT environment variable.',
      'If the app needs non-secret configuration (for example PORT, NODE_ENV, LOG_LEVEL, or a hostname), call set_env with a vars object. Never put passwords, API keys, tokens, or connection strings in a file or in set_env.',
      'If the app needs a value only the user can supply (an API key, password, token, or database URL), call declare_env_vars with { key, reason } entries and do not invent a value. The run stops and the user is asked to add it.',
      'Do not delete files, run tests, or execute code. The deployment is redeployed automatically after your edit.',
      'When the fix is in place, set goalAchieved=true. Do not set goalAchieved=true before you have changed a file or declared the required environment variables.',
    ];
    return [header, manifestsSection, failingSection, digestSection, tailSection, runtimeSection, hintsSection, manifestSection, previewSection, instructions]
      .map((section) => (Array.isArray(section) ? section.join('\n') : section))
      .filter(Boolean)
      .join('\n\n');
  };

  let goal = render();
  // The digest already contains the failing lines, so drop the raw tail first,
  // then runtime logs, then previews, then shrink the digest. Previews are the
  // most useful context for the model and should survive as long as possible.
  if (goal.length > budget && includeTail) {
    includeTail = false;
    goal = render();
  }
  if (goal.length > budget && includeRuntime) {
    includeRuntime = false;
    goal = render();
  }
  if (goal.length > budget && includePreviews) {
    includePreviews = false;
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
        company: workspaceId,
        project: String(projectId),
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
    plan: `Read the ${deployment.failureStage || 'deployment'} failure, fix the project files, then redeploy automatically.`,
    metadata: {
      startedFrom: 'deployment-self-heal',
      deploymentId: String(deployment._id),
      workspaceId,
      failureStage: deployment.failureStage || null,
      fault: deployment.fault || null,
    },
  });

  // Background runs have no browser attached. Persist a short, human-readable
  // trace on the deployment (surfaced by the deployment API) and in the agent
  // execution log so the user can follow what the agent is doing.
  const appendLog = (message) => {
    const text = String(message || '').trim().slice(0, 1000);
    if (!text) return;
    const timestamp = new Date();
    AgentExecution.updateOne(
      { _id: execution._id },
      {
        $push: {
          logs: { $each: [{ timestamp, message: text }], $slice: -200 },
          terminalLog: { $each: [{ timestamp, type: 'progress', message: text }], $slice: -200 },
        },
      }
    ).catch(() => {});
    Deployment.updateOne(
      { _id: deployment._id },
      { $set: { 'selfHeal.progress': text } }
    ).catch(() => {});
  };

  const progressLine = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    switch (payload.type) {
      case 'thinking':
        return `Step ${payload.iteration}: reviewing the failure and planning the fix.`;
      case 'iteration': {
        const tool = payload.action?.tool;
        return `Step ${payload.iteration}: ${payload.message || (tool ? `running ${tool}` : 'working')}.`;
      }
      case 'result': {
        const tool = payload.action?.tool || 'step';
        return payload.result?.success
          ? `Step ${payload.iteration}: ${tool} succeeded.`
          : `Step ${payload.iteration}: ${tool} failed — ${payload.result?.message || 'unknown error'}.`;
      }
      case 'error':
        return `Agent error: ${payload.message || 'unknown error'}.`;
      case 'done':
        return payload.success
          ? `Agent finished after ${payload.iterations || 0} step(s).`
          : `Agent stopped after ${payload.iterations || 0} step(s)${payload.stopReason ? `: ${payload.stopReason}` : '.'}`;
      default:
        return null;
    }
  };

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
    // Filled by the set_env / declare_env_vars tools while the agent runs.
    agentEnv: {},
    requiredEnv: [],
    agentMaxTokens: AGENT_MAX_TOKENS,
    // An autonomous repair must not die because one provider is down or the
    // user's preferred provider is rate-limited.
    allowProviderFallback: true,
    allowedTools: AUTONOMOUS_TOOLS,
    autoApproveTools: AUTO_APPROVE_TOOLS,
    skipAutoValidation: true,
    maxRuntimeMs: AGENT_TIMEOUT_MS,
    onProgress: (payload) => {
      const line = progressLine(payload);
      if (line) appendLog(line);
    },
  };

  const runtime = deployment.runtime || null;
  const run = (goalCompact, goalPreviews) => agentOrchestrator.executeAgenticLoop(
    buildHealingGoal(deployment, projectId, files, goalPreviews, { compact: goalCompact, runtime }),
    context,
    execution._id
  );

  appendLog('Reading the deployment failure and the project files involved.');
  let result;
  try {
    result = await run(compact, compact ? [] : previewFiles);
    // Some providers reject the request before it reaches the model (token
    // budget, TPM, context length). Self-heal starts compact, but a caller
    // that passes a non-compact goal can still hit the limit; retrying inline
    // with the compact prompt avoids spending a repair attempt on a request
    // that was never evaluated.
    if (!compact && result && result.success === false && isTokenLimitError(result.error)) {
      appendLog('The repair prompt exceeded the provider limit; retrying with a compact prompt.');
      result = await run(true, []);
    }
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await AgentExecution.updateOne(
      { _id: execution._id },
      { $set: { status: 'failed', summary: message } }
    ).catch(() => {});
    appendLog(`Agent failed: ${message}`);
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
  const agentEnv = Object.keys(context.agentEnv || {}).length ? { ...context.agentEnv } : {};
  const requiredEnv = Array.isArray(context.requiredEnv) ? context.requiredEnv.slice(0, 20) : [];
  const failureDetail = result?.error || result?.summary?.stopReason || null;
  const summary = requiredEnv.length
    ? `Agent needs environment variables from the user: ${requiredEnv.map((item) => item.key).join(', ')}.`
    : (!changed && failureDetail)
      ? `Agent failed: ${failureDetail}`
      : (result?.summary?.finalThought
        || (changed ? 'Agent edited project files.' : 'Agent made no file changes.'));

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
    success: result?.success !== false || changed || requiredEnv.length > 0,
    changed,
    agentEnv,
    requiredEnv,
    summary,
    error: failureDetail,
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
    .limit(1000)
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
  // Self-heal runs start in compact mode by default: the goal is already
  // bounded to COMPACT_GOAL_CHARS and the agent reads files with read_file,
  // so the request fits under an 8k TPM cap on the first attempt. A previous
  // attempt's oversized prompt is still detected here and kept compact.
  const compact = isTokenLimitError(deployment.selfHeal?.lastError) || true;
  notifyDeploymentEvent({
    type: 'deployment_healing',
    deployment: deploymentNotificationTarget(deployment, workspaceId),
    userId: deployment.userId,
    detail: `Attempt ${attempts}/${MAX_ATTEMPTS} to repair ${deployment.subdomain}.buildrshq.dev.`,
  });

  try {
    if (deployment.fault === 'user') {
      const agentResult = await runHealingAgent(deployment, { projectId, workspaceId, files, compact });
      // The agent may have declared secrets only the user can supply. Stop and
      // ask, instead of letting it hardcode anything.
      if (agentResult.requiredEnv?.length) {
        await Deployment.updateOne(
          { _id: deployment._id },
          { $set: { 'selfHeal.requiredEnv': agentResult.requiredEnv } }
        ).catch(() => {});
        const keys = agentResult.requiredEnv.map((item) => item.key);
        notifyDeploymentEvent({
          type: 'deployment_env_required',
          deployment: deploymentNotificationTarget(deployment, workspaceId),
          userId: deployment.userId,
          detail: `${deployment.subdomain}.buildrshq.dev needs environment variables only you can provide: ${keys.join(', ')}. Add them to the deployment, then redeploy.`,
        });
        return await markGaveUp(
          deployment,
          `Deployment self-heal stopped: set ${keys.join(', ')} on the deployment, then redeploy.`,
          null,
          workspaceId,
          { notify: false }
        );
      }
      // Non-secret configuration the agent set is merged into the stored env
      // (existing secrets are preserved and re-encrypted by normalizeEnv).
      if (agentResult.agentEnv && Object.keys(agentResult.agentEnv).length) {
        const merged = { ...toObject(deployment.env || []), ...agentResult.agentEnv };
        const entries = normalizeEnv(merged);
        deployment.env = entries;
        await Deployment.updateOne(
          { _id: deployment._id },
          { $set: { env: entries } }
        ).catch(() => {});
      }
      if (!agentResult.success) {
        if (isProviderConfigError(agentResult.error)) {
          return await markGaveUp(
            deployment,
            `Deployment self-heal stopped: the AI provider rejected the repair request (${agentResult.error}). Check the provider API key.`,
            agentResult.error,
            workspaceId
          );
        }
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
          'selfHeal.requiredEnv': [],
        },
      }
    );
    const modified = result?.modifiedCount ?? result?.n ?? 0;
    if (modified > 0 && delayMs <= 0) {
      // Do not wait for the next poll. The atomic claim in processDeployment
      // makes this safe to run alongside a scheduled tick.
      setImmediate(() => {
        processDeployment(deploymentId).catch((error) => {
          logError('immediate self-heal run failed', error);
        });
      });
    }
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
  detectManifests,
  dependencyManifestFor,
  isErrorLine,
  buildFileManifest,
  resolveRepairWorkspaces,
  isTokenLimitError,
  isProviderConfigError,
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
