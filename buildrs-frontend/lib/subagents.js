/**
 * Subagent model for the coordinator/worker view.
 *
 * Records come from `SubagentExecution` via `GET /api/v1/agent/:executionId/subagents`
 * and live `agent:subagent:*` socket events (see utils/subagentService.js on the
 * API side). Roles and statuses below mirror that model exactly.
 */

export const SUBAGENT_ROLES = {
  coordinator: {
    label: 'Coordinator',
    blurb: 'Owns the plan, delegates tasks and merges the results.',
  },
  researcher: {
    label: 'Researcher',
    blurb: 'Investigates the codebase and returns findings and file leads.',
  },
  coder: {
    label: 'Coder',
    blurb: 'Implements a focused change and returns the target files.',
  },
  reviewer: {
    label: 'Reviewer',
    blurb: 'Reviews a plan or code and returns prioritized feedback.',
  },
  tester: {
    label: 'Tester',
    blurb: 'Defines test cases and verification steps for a change.',
  },
};

/** Backend statuses: idle → running → complete | failed. */
export const SUBAGENT_STATUSES = {
  idle: { label: 'Queued', tone: 'idle' },
  running: { label: 'Running', tone: 'active' },
  complete: { label: 'Done', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
};

export function subagentStatusMeta(status) {
  return SUBAGENT_STATUSES[status] || SUBAGENT_STATUSES.idle;
}

export function subagentRoleMeta(role) {
  return SUBAGENT_ROLES[role] || { label: role, blurb: '' };
}

/** Rough completion share used by the header bar; the API has no percentage. */
const STATUS_PROGRESS = { idle: 0, running: 50, complete: 100, failed: 100 };

export function subagentProgress(worker) {
  return STATUS_PROGRESS[worker?.status] ?? 0;
}

/**
 * Normalizes either a `SubagentExecution` record or an `agent:subagent:*`
 * payload into the shape the tree renders.
 */
export function normalizeSubagent(source, at = Date.now()) {
  if (!source) return null;
  const id = source.subagentExecutionId || source._id;
  if (!id) return null;
  return {
    id: String(id),
    parentExecutionId: source.parentExecutionId ? String(source.parentExecutionId) : null,
    role: source.role || 'researcher',
    status: source.status || 'idle',
    task: source.instruction || source.task || '',
    output: typeof source.output === 'string' ? source.output : '',
    error: source.error || '',
    phase: source.phase || '',
    message: source.message || '',
    startedAt: source.startedAt || null,
    completedAt: source.completedAt || null,
    at,
  };
}

/**
 * Upserts a normalized worker by `id`. Progress and complete events omit fields
 * that arrived earlier (the instruction, the output), so empty values never
 * overwrite what is already known.
 */
export function mergeSubagent(workers, next) {
  if (!next) return workers;
  const index = workers.findIndex((worker) => worker.id === next.id);
  if (index === -1) return [...workers, next];
  const merged = { ...workers[index] };
  Object.entries(next).forEach(([key, value]) => {
    if (value === '' || value === null || value === undefined) return;
    merged[key] = value;
  });
  const updated = [...workers];
  updated[index] = merged;
  return updated;
}

/**
 * Aggregates worker state into the numbers shown above the tree.
 * `progress` is the share of workers that reached a terminal state.
 */
export function summarizeSubagents(workers = []) {
  const counts = workers.reduce(
    (acc, worker) => ({ ...acc, [worker.status]: (acc[worker.status] || 0) + 1 }),
    { idle: 0, running: 0, complete: 0, failed: 0 },
  );
  const settled = counts.complete + counts.failed;
  const progress = workers.length ? Math.round((settled / workers.length) * 100) : 0;
  return { total: workers.length, counts, progress };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

export function formatSubagentDuration(worker) {
  if (!worker?.startedAt) return '';
  const end = worker.completedAt ? new Date(worker.completedAt).getTime() : Date.now();
  return formatDuration(end - new Date(worker.startedAt).getTime());
}
