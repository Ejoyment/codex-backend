const mongoose = require('mongoose');
const Company = require('../models/Company');
const { findPersonalWorkspace, findPersonalWorkspaceById, ensurePersonalWorkspace } = require('./personalWorkspace');

function normalizeWorkspaceId(value) {
    if (!value) return null;
    if (typeof value === 'object') {
        const nested = value.workspaceId || value.companyId || value.company || value._id || value.id;
        return nested ? normalizeWorkspaceId(nested) : null;
    }
    const normalized = String(value).trim();
    return normalized || null;
}

function isMember(workspace, userId) {
    if (!workspace || !userId) return false;
    const uid = String(userId);
    // Personal workspace (subscription): owner is userId
    if (workspace.userId && String(workspace.userId) === uid) return true;
    // Team workspace (company): check owner and members
    if (workspace.owner && String(workspace.owner) === uid) return true;
    return Array.isArray(workspace.members)
        && workspace.members.some((member) => {
            const memberId = member && (member.user || member.userId);
            return memberId && String(memberId) === uid;
        });
}

async function resolveWorkspaceForUser(workspaceId, userId) {
    const requestedId = normalizeWorkspaceId(workspaceId);
    if (!requestedId || !userId) return null;

    if (requestedId === String(userId)) {
        if (!mongoose.isValidObjectId(requestedId)) return null;
        let workspace = await findPersonalWorkspace(userId);
        if (!workspace) {
            workspace = await ensurePersonalWorkspace(userId);
        }
        return workspace ? { workspace, personal: true } : null;
    }

    if (!mongoose.isValidObjectId(requestedId)) return null;
    const workspace = await Company.findById(requestedId)
        .select('_id owner members isActive')
        .lean();
    if (workspace) {
        if (workspace.isActive === false) return null;
        if (!isMember(workspace, userId)) return null;
        return { workspace, personal: false };
    }

    // A personal workspace is a Subscription, not a Company. Projects, files
    // and executions store the Subscription `_id`, so accept it when the
    // caller owns it — otherwise approving or rejecting their own agent run
    // is denied with "Workspace not found or access denied".
    const personal = await findPersonalWorkspaceById(userId, requestedId);
    if (personal && String(personal._id) === requestedId) {
        return { workspace: personal, personal: true };
    }

    return null;
}

async function canonicalWorkspaceId(workspaceId, userId) {
    const resolved = await resolveWorkspaceForUser(workspaceId, userId);
    return resolved ? String(resolved.workspace._id) : null;
}

/**
 * Resolve a workspace reference to the caller's scope.
 *
 * Accepts a Company the caller belongs to, the caller's user id, or the
 * caller's personal workspace (Subscription) id. Personal workspaces are
 * stored by their own `_id` on CodeFile.company and LocalProject.workspaceId,
 * so both forms must resolve to the same personal scope.
 *
 * `fallbackToPersonal` is for server-owned references (project/task/session
 * data) whose stored workspace may predate the personal/workspace split. Such
 * a stale id resolves to the caller's personal workspace instead of locking
 * them out. Explicit client-supplied workspace ids should leave it off so a
 * foreign tenant id is still rejected.
 *
 * Returns { ok, workspace, workspaceId, personal } or { ok: false, reason }.
 */
async function resolveWorkspaceScope(workspaceId, userId, { fallbackToPersonal = false } = {}) {
    if (!userId) return { ok: false, reason: 'Authentication required' };
    const raw = normalizeWorkspaceId(workspaceId);

    if (raw) {
        const resolved = await resolveWorkspaceForUser(raw, userId);
        if (resolved) {
            return {
                ok: true,
                workspace: resolved.workspace,
                workspaceId: String(resolved.workspace._id),
                personal: resolved.personal,
            };
        }

        // A personal workspace is a Subscription, not a Company. It is
        // addressable by the owner's user id (handled above) and by its own
        // _id, which is what projects/files actually store.
        const personal = await findPersonalWorkspace(userId);
        if (personal && String(personal._id) === raw) {
            return {
                ok: true,
                workspace: personal,
                workspaceId: String(personal._id),
                personal: true,
            };
        }
    }

    if (fallbackToPersonal || !raw) {
        const personal = await ensurePersonalWorkspace(userId);
        if (personal) {
            return {
                ok: true,
                workspace: personal,
                workspaceId: String(personal._id),
                personal: true,
            };
        }
    }

    // Do not distinguish "no such workspace" from "not a member": the former
    // would be an enumeration oracle across tenants.
    return { ok: false, reason: 'Workspace not found or access denied' };
}

module.exports = {
    normalizeWorkspaceId,
    isMember,
    resolveWorkspaceForUser,
    resolveWorkspaceScope,
    canonicalWorkspaceId,
};
