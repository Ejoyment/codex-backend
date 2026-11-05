/**
 * Agent Runner
 *
 * Shared execution core for delegated agent jobs. The socket loop and the
 * worker thread both used to build a one-shot prompt, send the raw codebase to
 * the model, and fail hard when the model replied with prose instead of the
 * requested `### file:` markers. That made the agent feel shallow and made a
 * failed delegation a dead end.
 *
 * This module gives every run:
 *  - a task/project/spec brief (including comments, prior failures, and the
 *    project the task belongs to),
 *  - relevance-ranked file contents plus a full repository path manifest,
 *  - a bounded self-repair loop that re-prompts with the exact output contract
 *    when a response contains no parseable changes,
 *  - a plan-only completion result instead of a hard failure when the model
 *    still refuses to emit changes, so the caller can keep the run reviewable.
 */

const aiRouterService = require('./aiRouterService');
const agentChangeSet = require('./agentChangeSet');

const DEFAULT_CONTEXT_FILES = parseInt(process.env.AGENT_CONTEXT_FILES, 10) || 18;
const DEFAULT_MANIFEST_LIMIT = parseInt(process.env.AGENT_MANIFEST_LIMIT, 10) || 500;
const DEFAULT_FILE_CHARS = parseInt(process.env.AGENT_CONTEXT_FILE_CHARS, 10) || 18000;
const DEFAULT_TOTAL_CHARS = parseInt(process.env.AGENT_CONTEXT_TOTAL_CHARS, 10) || 120000;
const DEFAULT_MAX_ATTEMPTS = parseInt(process.env.AGENT_CHANGE_ATTEMPTS, 10) || 3;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'were', 'will', 'should', 'would', 'could', 'can', 'must',
  'have', 'has', 'had', 'not', 'but', 'all', 'any', 'each', 'when', 'then',
  'than', 'them', 'they', 'their', 'there', 'here', 'what', 'which', 'who',
  'how', 'why', 'use', 'using', 'used', 'make', 'made', 'need', 'needed',
  'add', 'added', 'update', 'updated', 'change', 'changed', 'fix', 'fixed',
  'task', 'project', 'workspace', 'file', 'files', 'code', 'please', 'also',
  'about', 'over', 'under', 'after', 'before', 'new', 'old', 'only', 'just',
  'some', 'such', 'very', 'more', 'most', 'other', 'same', 'our', 'out',
]);

const ENTRY_POINT_HINTS = [
  /^package\.json$/i,
  /^readme(\.|$)/i,
  /^server\.(js|ts)$/i,
  /^app\.(js|ts|jsx|tsx|py)$/i,
  /^index\.(js|ts|jsx|tsx|py|html)$/i,
  /^main\.(js|ts|jsx|tsx|py|go|rs)$/i,
  /(^|\/)(routes|api|controller|controllers|pages|app)\//i,
  /(^|\/)(models|schema|types)\//i,
];

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function fullPathOf(file) {
  return agentChangeSet.normalizeFullPath(file) || '';
}

function tokenize(value) {
  const text = String(value || '');
  const matches = text.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) || [];
  const terms = new Set();
  for (const match of matches) {
    const lower = match.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    terms.add(lower);
    // Split camelCase / snake_case / kebab-case so `getUserProfile` matches
    // `user-profile` in a path.
    for (const part of match.split(/[_-]|(?<=[a-z0-9])(?=[A-Z])/)) {
      const piece = part.toLowerCase();
      if (piece.length >= 3 && !STOP_WORDS.has(piece)) terms.add(piece);
    }
  }
  return [...terms];
}

function specText(specs = []) {
  return (specs || []).map((spec) => [
    spec.title,
    spec.description,
    spec.content,
    ...(spec.requirements || []).map((req) => req.text || req.description || req.title || req),
    ...(spec.architecturalRules || []),
    ...(spec.constraints || []),
  ].filter(Boolean).join(' ')).join('\n');
}

function projectText(project) {
  if (!project) return '';
  return [
    project.name,
    project.description,
    project.status,
    ...(project.technologies || []),
    ...(project.tags || []),
    project.githubRepoName,
  ].filter(Boolean).join(' ');
}

function taskText(task = {}, taskTitle = '') {
  return [
    task.title || taskTitle,
    task.description,
    task.priority,
    task.figmaNodeId,
    ...(task.labels || []),
  ].filter(Boolean).join(' ');
}

function scoreFile(file, terms, explicitPaths) {
  const full = fullPathOf(file);
  if (!full) return 0;
  const lowerPath = full.toLowerCase();
  const lowerName = String(file.name || '').toLowerCase();
  const lowerContent = String(file.content || '').toLowerCase();

  let score = 0;
  if (explicitPaths.has(lowerPath)) score += 80;
  const basename = lowerPath.split('/').pop();
  if (explicitPaths.has(basename)) score += 50;

  for (const term of terms) {
    if (lowerPath === term || basename === term) score += 12;
    else if (lowerPath.includes(term)) score += 6;
    else if (lowerName.includes(term)) score += 5;
    if (lowerContent.includes(term)) score += 1.5;
  }

  if (ENTRY_POINT_HINTS.some((re) => re.test(full))) score += 4;
  return score;
}

function explicitPathsIn(text) {
  const paths = new Set();
  const re = /([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,12})/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    if (match[1].includes('://')) continue;
    paths.add(match[1].toLowerCase());
  }
  return paths;
}

function buildManifest(files = [], limit = DEFAULT_MANIFEST_LIMIT) {
  const paths = [...new Set((files || []).map(fullPathOf).filter(Boolean))].sort();
  return {
    total: paths.length,
    truncated: paths.length > limit,
    paths: paths.slice(0, limit),
  };
}

/**
 * Pick the files the model should actually read. Every file path is still
 * listed in the manifest, so the model knows the repository shape even when
 * only the most relevant contents fit in the context window.
 */
function selectRelevantFiles(files = [], options = {}) {
  const {
    task = {},
    taskTitle = '',
    project = null,
    specs = [],
    limit = DEFAULT_CONTEXT_FILES,
    fileChars = DEFAULT_FILE_CHARS,
    totalChars = DEFAULT_TOTAL_CHARS,
  } = options;

  const allFiles = (files || []).filter((file) => fullPathOf(file));
  const limitValue = clampInt(limit, DEFAULT_CONTEXT_FILES, 1, 60);
  if (!allFiles.length) return { files: [], manifest: buildManifest([]) };

  const queryText = [
    taskText(task, taskTitle),
    projectText(project),
    specText(specs),
  ].join('\n');
  const terms = tokenize(queryText);
  const explicitPaths = explicitPathsIn(queryText);

  const ranked = allFiles
    .map((file, index) => ({ file, index, score: scoreFile(file, terms, explicitPaths) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));

  // Always include obvious entry points when the task mentions nothing
  // specific, and always include files that were explicitly named.
  const selected = [];
  const seen = new Set();
  const add = (entry) => {
    const full = fullPathOf(entry.file);
    if (!full || seen.has(full)) return;
    seen.add(full);
    selected.push(entry.file);
  };

  for (const entry of ranked) {
    if (explicitPaths.has(fullPathOf(entry.file).toLowerCase())) add(entry);
  }
  for (const entry of ranked) {
    if (selected.length >= limitValue) break;
    if (entry.score > 0) add(entry);
  }
  for (const entry of ranked) {
    if (selected.length >= limitValue) break;
    add(entry);
  }

  // Apply a content budget so one huge file cannot crowd out everything else.
  const bounded = [];
  let remaining = clampInt(totalChars, DEFAULT_TOTAL_CHARS, 10000, 400000);
  for (const file of selected) {
    if (bounded.length >= limitValue || remaining <= 0) break;
    const content = String(file.content || '');
    const perFile = clampInt(fileChars, DEFAULT_FILE_CHARS, 1000, 80000);
    const keep = Math.min(content.length, perFile, remaining);
    bounded.push({
      ...file,
      content: keep < content.length
        ? `${content.slice(0, keep)}\n\n[truncated ${content.length - keep} characters]`
        : content,
    });
    remaining -= keep;
  }

  return { files: bounded, manifest: buildManifest(allFiles) };
}

function formatPriorAttempt(priorAttempt) {
  if (!priorAttempt) return '';
  const parts = [];
  if (priorAttempt.status) parts.push(`Previous run status: ${priorAttempt.status}`);
  if (priorAttempt.error) parts.push(`Previous failure: ${String(priorAttempt.error).slice(0, 1500)}`);
  if (priorAttempt.summary) parts.push(`Previous summary: ${String(priorAttempt.summary).slice(0, 2500)}`);
  if (priorAttempt.filesChanged?.length) {
    parts.push(`Previous files changed: ${priorAttempt.filesChanged.map((f) => f.path || f).join(', ').slice(0, 1000)}`);
  }
  if (priorAttempt.logs?.length) {
    const logs = priorAttempt.logs.slice(-8).map((entry) => entry.message || entry).filter(Boolean);
    if (logs.length) parts.push(`Previous logs:\n${logs.map((line) => `- ${String(line).slice(0, 300)}`).join('\n')}`);
  }
  return parts.join('\n');
}

function buildAgentContext({
  task = {},
  taskTitle = '',
  project = null,
  specs = [],
  codeFiles = [],
  contextSummary = '',
  priorAttempt = null,
  branch = '',
  baseBranch = 'main',
  workspaceId = null,
  provider = null,
  model = null,
} = {}) {
  const { files: contextFiles, manifest } = selectRelevantFiles(codeFiles, {
    task,
    taskTitle,
    project,
    specs,
  });

  const title = task.title || taskTitle || 'Workspace task';
  const projectLine = project
    ? `Project: ${project.name || 'Untitled project'}${project.status ? ` (${project.status})` : ''}`
    : 'Project: not linked';
  const technologies = project?.technologies?.length ? `Technologies: ${project.technologies.join(', ')}` : '';
  const description = String(task.description || '').trim();

  const systemLines = [
    'You are a senior autonomous software engineer working inside a real product repository.',
    'You are not a chat assistant: your job is to implement the task by returning concrete file changes, not to describe what someone else could do.',
    '',
    `TASK: ${title}`,
    projectLine,
    technologies,
    branch ? `Agent branch: ${branch} (base: ${baseBranch || 'main'})` : '',
    workspaceId ? `Workspace: ${workspaceId}` : '',
    task.priority ? `Priority: ${task.priority}` : '',
    description ? `\nTASK DESCRIPTION\n${description.slice(0, 8000)}` : '',
  ].filter(Boolean);

  if (contextSummary) {
    systemLines.push('', 'WORKSPACE / TEAM CONTEXT', String(contextSummary).trim());
  }

  const prior = formatPriorAttempt(priorAttempt);
  if (prior) {
    systemLines.push(
      '',
      'PREVIOUS ATTEMPT (learn from this; do not repeat the same failure)',
      prior,
    );
  }

  systemLines.push(
    '',
    'HOW TO WORK',
    '- Read the supplied relevant files and the repository manifest before deciding where changes belong.',
    '- Reuse existing imports, helpers, naming, styling, and API conventions. Do not invent a parallel implementation when an existing file can be edited.',
    '- If the task references a project, screen, endpoint, model, or flow, locate its existing implementation in the manifest first.',
    '- Make the smallest coherent set of changes that fully implements the request. It is better to change one real file correctly than to describe ten hypothetical ones.',
    '- Do not claim you applied, tested, or committed changes. The application stages and validates your proposal.',
    '',
    agentChangeSet.CHANGE_FORMAT_INSTRUCTIONS,
  );

  const messages = [{ role: 'system', content: systemLines.join('\n') }];

  if (specs.length) {
    messages.push({
      role: 'system',
      content: `Frozen spec contracts (these are acceptance criteria, not suggestions):\n${JSON.stringify(
        specs.map((spec) => ({
          name: spec.title,
          description: spec.description,
          targetModules: spec.targetModules,
          architecturalRules: spec.architecturalRules,
          requirements: spec.requirements,
          forbiddenImports: spec.forbiddenImports,
          constraints: spec.constraints,
        })),
        null,
        2
      )}`,
    });
  }

  messages.push({
    role: 'user',
    content: [
      `Implement this task now: ${title}`,
      description ? `\nRequirements:\n${description}` : '',
      '\nReturn a short implementation plan followed by every file you change, using the exact `### file: <path>` marker format. At least one concrete file change is required unless this task is purely investigative.',
    ].filter(Boolean).join('\n'),
  });

  const codeContext = {
    workspaceId,
    files: contextFiles,
    agentMode: true,
    provider,
    model,
    fileManifest: manifest,
    instructions: [
      'You are editing the repository whose manifest is provided.',
      'Use project-relative paths in every file marker.',
      'Prefer updating an existing file from the manifest over creating a duplicate.',
      branch ? `Stage work on branch ${branch}.` : '',
    ].filter(Boolean).join(' '),
  };

  return {
    messages,
    codeContext,
    contextFiles,
    manifest,
  };
}

function buildRepairPrompt({ attempt, exhausted = false, manifest }) {
  const manifestSample = manifest?.paths?.length
    ? `\nRepository paths you can target (sample):\n${manifest.paths.slice(0, 120).map((p) => `- ${p}`).join('\n')}`
    : '';
  return [
    'Your previous response contained no file changes that the application can apply.',
    'That is a failed implementation for this job. Do not apologize and do not only explain.',
    '',
    'Return the implementation now, in this exact format:',
    '### file: <project-relative/path>',
    '```<language>',
    '<complete new file contents>',
    '```',
    '',
    'Rules:',
    '- Choose the most relevant existing file(s) from the manifest and update them.',
    '- Emit the complete resulting file body, not a partial diff or a description.',
    '- Never use absolute paths, `..`, or paths outside the repository.',
    '- Do not wrap the whole answer in a single code fence.',
    exhausted
      ? '- This is the final attempt: produce at least one concrete file change. If the task is investigative, write the findings into an existing relevant markdown file or a new `docs/` markdown file.'
      : '- Produce at least one concrete file change.',
    manifestSample,
  ].join('\n');
}

/**
 * Ask the model for a change set, retrying with a corrective prompt when the
 * first answer is prose. Never throws for an unparseable answer: callers get a
 * plan-only result so the run can still be reviewed or re-delegated.
 */
async function requestChangeSet({
  messages,
  codeContext = {},
  codeFiles = [],
  provider = null,
  model = null,
  localPrivacyMode = false,
  timeoutMs = null,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  onAttempt = null,
} = {}) {
  const attemptsLimit = clampInt(maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 5);
  const conversation = (messages || []).map((message) => ({ ...message }));
  const attempts = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    if (onAttempt) {
      try {
        await onAttempt({ attempt, maxAttempts: attemptsLimit });
      } catch (error) {
        console.error('[agent-runner] attempt callback failed:', error.message);
      }
    }

    const result = await aiRouterService.routeChat(conversation, {
      ...codeContext,
      agentAttempt: attempt,
    }, {
      provider,
      model,
      localPrivacyMode,
      ...(timeoutMs ? { timeoutMs } : {}),
    });

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Agent AI request failed without an error message',
        attempts,
        attemptsUsed: attempt,
        result,
      };
    }

    lastResult = result;
    const content = result.content || '';
    const changes = agentChangeSet.buildChangeset(content, codeFiles);
    attempts.push({ attempt, content, changeCount: changes.length });

    if (changes.length) {
      return {
        success: true,
        changes,
        content,
        result,
        attempts,
        attemptsUsed: attempt,
        planOnly: false,
      };
    }

    if (attempt < attemptsLimit) {
      conversation.push({
        role: 'assistant',
        content: content.length > 12000 ? `${content.slice(0, 12000)}\n\n[response truncated for retry]` : content,
      });
      conversation.push({
        role: 'user',
        content: buildRepairPrompt({
          attempt,
          exhausted: attempt === attemptsLimit - 1,
          manifest: codeContext.fileManifest,
        }),
      });
    }
  }

  return {
    success: true,
    changes: [],
    content: lastResult?.content || '',
    result: lastResult,
    attempts,
    attemptsUsed: attemptsLimit,
    planOnly: true,
    exhausted: true,
  };
}

function describeAttempts(attempts = []) {
  return attempts
    .map((attempt) => `attempt ${attempt.attempt}: ${attempt.changeCount} file(s)`)
    .join(', ');
}

module.exports = {
  DEFAULT_CONTEXT_FILES,
  DEFAULT_MAX_ATTEMPTS,
  buildManifest,
  selectRelevantFiles,
  buildAgentContext,
  requestChangeSet,
  describeAttempts,
};
