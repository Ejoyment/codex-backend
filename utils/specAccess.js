/**
 * Spec access control.
 *
 * A Spec belongs to a Project, not to a Workspace. Access follows the project:
 * anyone who can reach the project can view, edit, verify and delete its specs.
 *
 *   Workspace            -> collaboration layer on top (admin/member checks)
 *   Solo project         -> owner only, no workspace required at all
 *
 * A user can reach a project when any of these hold:
 *   - they own it (LocalProject.userId)
 *   - they are listed on it (LocalProject.members)
 *   - they are an owner/member of the workspace the project belongs to
 */

const mongoose = require('mongoose');
const LocalProject = require('../models/LocalProject');
const Company = require('../models/Company');
const SpecModel = require('../models/SpecModel');

const idOf = (value) => (value && value._id ? value._id.toString() : value ? value.toString() : null);

/**
 * Can this user reach the project?
 */
async function userCanAccessProject(projectId, userId) {
  if (!projectId || !userId) return false;

  const project = await LocalProject.findById(projectId).select('userId members workspaceId').lean();
  if (!project) return false;

  const uid = idOf(userId);

  if (idOf(project.userId) === uid) return true;
  if ((project.members || []).some((member) => idOf(member) === uid)) return true;

  // Collaborative escape hatch: membership in the project's workspace.
  if (project.workspaceId) {
    const workspace = await Company.findById(project.workspaceId).select('owner members').lean();
    if (workspace) {
      if (idOf(workspace.owner) === uid) return true;
      if ((workspace.members || []).some((member) => idOf(member.user || member) === uid)) return true;
    }
  }

  return false;
}

/**
 * Can this user reach the project this spec belongs to?
 */
async function userCanAccessSpec(spec, userId) {
  if (!spec) return false;
  return userCanAccessProject(spec.projectId, userId);
}

/**
 * Can this user see workspace-scoped views (spec health across projects)?
 * Membership only — this is the collaboration layer, not a requirement for
 * using specs on a project you own.
 */
async function userCanAccessWorkspace(workspaceId, userId) {
  if (!workspaceId || !userId) return false;
  const uid = idOf(userId);
  const workspace = await Company.findById(workspaceId).select('owner members').lean();
  if (!workspace) return false;
  if (idOf(workspace.owner) === uid) return true;
  return (workspace.members || []).some((member) => idOf(member.user || member) === uid);
}

/**
 * Every project the user can reach: projects they own, projects they were
 * added to, and projects inside a workspace they belong to. Used by the
 * project list so collaborators see the same projects the spec API allows.
 */
async function getAccessibleProjects(userId) {
  if (!userId) return [];
  const raw = idOf(userId);
  if (!mongoose.Types.ObjectId.isValid(raw)) return [];
  const uid = new mongoose.Types.ObjectId(raw);

  const workspaces = await Company.find({
    $or: [{ owner: uid }, { 'members.user': uid }]
  }).select('_id').lean();
  const workspaceIds = (workspaces || []).map((workspace) => workspace._id);

  const clauses = [{ userId: uid }, { members: uid }];
  if (workspaceIds.length) clauses.push({ workspaceId: { $in: workspaceIds } });

  return LocalProject.find({ isArchived: false, $or: clauses }).sort({ updatedAt: -1 });
}

/**
 * The workspace a spec's code lives under, if any.
 * Falls back to the parent project's workspace when the spec predates the
 * project-scoping change or was created without one.
 */
async function getSpecWorkspaceId(spec) {
  if (!spec) return null;
  if (spec.workspaceId) return idOf(spec.workspaceId);
  if (!spec.projectId) return null;

  const project = await LocalProject.findById(spec.projectId).select('workspaceId').lean();
  return project?.workspaceId ? idOf(project.workspaceId) : null;
}

/**
 * Every project id belonging to a workspace — used to list a workspace's specs
 * across all of its projects.
 */
async function getWorkspaceProjectIds(workspaceId) {
  const projects = await LocalProject.find({ workspaceId }).select('_id').lean();
  return projects.map((project) => idOf(project._id));
}

/**
 * Validate a set of spec ids against the project a task belongs to.
 * With a projectId every spec must live in that project; without one each
 * spec is checked individually so solo, project-less tasks still work.
 */
async function resolveAccessibleSpecs(specIds = [], { projectId, userId } = {}) {
  const unique = [...new Set(specIds.map(String))];
  if (!unique.length) return { ok: true, specs: [] };

  const specs = await SpecModel.find({ _id: { $in: unique } });
  if (specs.length !== unique.length) {
    return { ok: false, message: 'One or more specs were not found' };
  }

  if (projectId) {
    if (!await userCanAccessProject(projectId, userId)) {
      return { ok: false, message: 'Project access denied' };
    }
    const foreign = specs.find((spec) => idOf(spec.projectId) !== idOf(projectId));
    if (foreign) {
      return { ok: false, message: 'One or more specs do not belong to this project' };
    }
    return { ok: true, specs };
  }

  for (const spec of specs) {
    if (!await userCanAccessSpec(spec, userId)) {
      return { ok: false, message: 'Project access denied' };
    }
  }
  return { ok: true, specs };
}

module.exports = {
  userCanAccessProject,
  userCanAccessSpec,
  userCanAccessWorkspace,
  getAccessibleProjects,
  getSpecWorkspaceId,
  getWorkspaceProjectIds,
  resolveAccessibleSpecs
};
