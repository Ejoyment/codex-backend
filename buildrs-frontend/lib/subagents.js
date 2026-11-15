/**
 * Subagent model for the coordinator/worker view.
 *
 * The backend does not emit subagent runs yet, so `mockSubagentRun` fabricates a
 * plausible plan for layout work. It is deliberately shaped like the payload we
 * expect (role, task, status, progress, touched files) so swapping the mock for
 * real `agent:subagent` events only means replacing the factory call.
 */

export const SUBAGENT_ROLES = {
  coordinator: {
    label: 'Coordinator',
    blurb: 'Owns the plan, delegates tasks and merges the results.',
  },
  scout: {
    label: 'Scout',
    blurb: 'Reads the codebase and reports the files that matter.',
  },
  builder: {
    label: 'Builder',
    blurb: 'Writes the change in an isolated sandbox.',
  },
  verifier: {
    label: 'Verifier',
    blurb: 'Runs tests and checks the diff against the request.',
  },
  reviewer: {
    label: 'Reviewer',
    blurb: 'Summarises the change and flags what needs a human decision.',
  },
};

export const SUBAGENT_STATUSES = {
  queued: { label: 'Queued', tone: 'idle' },
  running: { label: 'Running', tone: 'active' },
  done: { label: 'Done', tone: 'success' },
  blocked: { label: 'Blocked', tone: 'error' },
};

const MOCK_PLAN = [
  {
    role: 'scout',
    task: 'Find the components that own the requested surface',
    status: 'done',
    progress: 100,
    durationMs: 42_000,
    touchedFiles: ['components/Sidebar.js', 'styles/workspace.css'],
  },
  {
    role: 'builder',
    task: 'Implement the change and keep edits scoped to those files',
    status: 'running',
    progress: 64,
    durationMs: 128_000,
    touchedFiles: ['components/Sidebar.js'],
  },
  {
    role: 'verifier',
    task: 'Run the build and contrast checks against the new markup',
    status: 'queued',
    progress: 0,
    touchedFiles: [],
  },
  {
    role: 'reviewer',
    task: 'Write the change summary and list review points',
    status: 'queued',
    progress: 0,
    touchedFiles: [],
  },
];

export function subagentStatusMeta(status) {
  return SUBAGENT_STATUSES[status] || SUBAGENT_STATUSES.queued;
}

export function subagentRoleMeta(role) {
  return SUBAGENT_ROLES[role] || { label: role, blurb: '' };
}

/** Aggregates worker state into the numbers shown above the tree. */
export function summarizeSubagents(run) {
  const workers = run?.workers || [];
  const counts = workers.reduce(
    (acc, worker) => ({ ...acc, [worker.status]: (acc[worker.status] || 0) + 1 }),
    { queued: 0, running: 0, done: 0, blocked: 0 },
  );
  const progress = workers.length
    ? Math.round(workers.reduce((sum, worker) => sum + (Number(worker.progress) || 0), 0) / workers.length)
    : 0;
  return { total: workers.length, counts, progress };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

export function formatSubagentDuration(ms) {
  return formatDuration(ms);
}

/**
 * Builds the mock run shown while the backend has no subagent events.
 * `goal` is only used for the coordinator line so the preview relates to the
 * request in the composer.
 */
export function mockSubagentRun(goal = '') {
  const trimmed = String(goal || '').replace(/\s+/g, ' ').trim();
  const summaryGoal = trimmed
    ? (trimmed.length > 110 ? `${trimmed.slice(0, 110)}…` : trimmed)
    : 'No request yet — start a run to replace this preview.';

  const workers = MOCK_PLAN.map((worker, index) => ({
    id: `${worker.role}-${index + 1}`,
    ...worker,
    ...subagentRoleMeta(worker.role),
    statusMeta: subagentStatusMeta(worker.status),
  }));

  return {
    mock: true,
    coordinator: {
      id: 'coordinator-1',
      role: 'coordinator',
      ...subagentRoleMeta('coordinator'),
      task: summaryGoal,
      status: 'running',
      statusMeta: subagentStatusMeta('running'),
    },
    workers,
  };
}
