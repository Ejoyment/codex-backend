/**
 * Project file scoping for agent runs.
 *
 * A workspace can contain several unrelated projects (different apps owned by
 * different people/teams). An agent delegated from a task must only be able to
 * read or write files that belong to that task's project — never another
 * project that happens to share the same workspace.
 *
 * `CodeFile.project` is the source of truth. Files created outside a project
 * carry no project id, so unlinked tasks are scoped to those unassigned files
 * instead of falling back to the whole workspace.
 */

function projectIdFrom(source) {
  if (!source) return null;
  const meta = source.metadata;
  const metaProject = meta && (typeof meta.get === 'function' ? meta.get('projectId') : meta.projectId);
  const value =
    source.projectId ||
    source.project?._id ||
    source.project ||
    metaProject ||
    null;
  return value ? String(value) : null;
}

/**
 * Resolve the project an agent execution is bound to. The execution's own
 * field wins, then its task, then metadata recorded at delegation time.
 */
function resolveProjectId({ projectId = null, task = null, execution = null } = {}) {
  return projectIdFrom({ projectId }) ||
    projectIdFrom(task) ||
    projectIdFrom(execution) ||
    null;
}

/**
 * Query for files in a specific project. With no project id this deliberately
 * targets only unassigned files (`project: null`), so an unlinked task can
 * never see another project's source.
 */
function projectFileQuery(workspaceId, projectId = null) {
  if (projectId) return { project: String(projectId) };
  const query = { project: null };
  if (workspaceId) query.company = String(workspaceId);
  return query;
}

/**
 * Query for agent tools that operate in a workspace and may optionally be
 * narrowed to a project. Used by the AI-pair assistant, where no project is
 * selected for a plain workspace chat.
 */
function fileQuery(workspaceId, projectId = null) {
  const query = {};
  if (workspaceId) query.company = String(workspaceId);
  if (projectId) query.project = String(projectId);
  return query;
}

module.exports = {
  projectIdFrom,
  resolveProjectId,
  projectFileQuery,
  fileQuery,
};
