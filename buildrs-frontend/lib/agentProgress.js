/**
 * Shared vocabulary for agent progress events.
 *
 * Both the chat transcript and the execution drawer receive the same
 * `agent:progress` payloads, so the label map and the normalised step shape
 * live here instead of being duplicated (and drifting) per surface.
 */

export const TOOL_LABELS = {
  list_files: 'Inspecting repository files',
  get_repository_status: 'Checking repository status',
  read_file: 'Reading a source file',
  search_code: 'Searching project code',
  analyze_code: 'Analyzing source code',
  run_tests: 'Running tests',
  execute_code: 'Running code in the sandbox',
  create_file: 'Creating a file',
  update_file: 'Updating a file',
  create_multiple_files: 'Creating project files',
  delete_file: 'Deleting a file',
};

/** Human sentence for a step: what the agent is doing, or just did. */
export function progressLabel(step = {}) {
  if (step.type === 'done') {
    return step.success ? 'Task complete' : step.summary?.stopReason || 'Task stopped';
  }
  const tool = step.action?.tool || step.tool;
  const label = TOOL_LABELS[tool] || 'Working on the requested task';
  if (step.type === 'result') {
    if (step.result?.success) return `${label} complete`;
    const detail = step.result?.message ? `: ${String(step.result.message).slice(0, 120)}` : '';
    return `${label} needs attention${detail}`;
  }
  return TOOL_LABELS[tool] || step.message || 'Working on the requested task';
}

let sequence = 0;

/**
 * Flattens an `agent:progress` payload (which may be wrapped in `payload`)
 * into the shape the reasoning surfaces render.
 */
export function normalizeProgress(raw, at = Date.now()) {
  const source = raw && typeof raw === 'object' && raw.payload && typeof raw.payload === 'object'
    ? raw.payload
    : (raw || {});
  const result = source.result && typeof source.result === 'object' ? source.result : null;
  const type = source.type || (source.phase === 'done' ? 'done' : 'iteration');
  const step = {
    id: `step-${(sequence += 1)}`,
    type,
    phase: source.phase || '',
    iteration: Number(source.iteration) || 0,
    maxIterations: Number(source.maxIterations) || 0,
    tool: source.action?.tool || source.tool || '',
    message: source.message || result?.message || '',
    action: source.action || null,
    result,
    success: typeof source.success === 'boolean' ? source.success : result?.success,
    summary: source.summary || null,
    at,
  };
  step.label = progressLabel(step);
  return step;
}

/** The most recent step that says something useful about the current state. */
export function latestStep(steps = []) {
  return steps.length ? steps[steps.length - 1] : null;
}
