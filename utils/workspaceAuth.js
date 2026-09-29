/**
 * Workspace (company) authorization helpers.
 *
 * A `workspaceId` in this codebase is a Company id: CodeFile stores it as
 * `company`, terminal sessions key their on-disk workspace off it, and
 * collaboration rooms attach to it. Any handler that accepts a workspaceId
 * from a client must prove the caller belongs to that workspace *before*
 * doing anything with it — otherwise a client can name someone else's
 * workspace and read or overwrite their files.
 */

const mongoose = require('mongoose');
const Company = require('../models/Company');

/**
 * Resolve a workspaceId to a Company document, or null when the id is not a
 * valid ObjectId or no such workspace exists.
 */
async function resolveWorkspace(workspaceId) {
    if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) return null;
    try {
        return await Company.findById(workspaceId).select('_id owner members role').lean();
    } catch (_) {
        return null;
    }
}

function isMemberOf(workspace, userId) {
    if (!workspace || !userId) return false;
    const uid = String(userId);
    if (workspace.owner && String(workspace.owner) === uid) return true;
    return Array.isArray(workspace.members)
        && workspace.members.some((m) => {
            const id = m && (m.user || m.userId);
            return id && String(id) === uid;
        });
}

/**
 * Assert the user is a member of the workspace.
 *
 * Two workspace forms are accepted:
 *   1. A Company workspace the user belongs to.
 *   2. A personal workspace, where the workspace id IS the user's own id.
 *      Every user has exactly one of these and it is derived from their own
 *      identity, so it cannot collide across tenants.
 *
 * Anything else — including the legacy shared 'default' id, which several
 * unrelated users would map to the same CodeFile.company — is rejected.
 *
 * Returns { ok: true, workspace } or { ok: false, reason }.
 */
async function assertWorkspaceAccess(workspaceId, userId) {
    if (!userId) {
        return { ok: false, reason: 'Authentication required' };
    }
    const wsId = String(workspaceId || '');

    // Personal workspace: the caller's own id.
    if (wsId && wsId === String(userId)) {
        return { ok: true, workspace: null, personal: true };
    }

    const workspace = await resolveWorkspace(wsId);
    if (!workspace) {
        // Do not distinguish "no such workspace" from "not a member": the
        // former is an enumeration oracle across tenants.
        return { ok: false, reason: 'Workspace not found or access denied' };
    }
    if (!isMemberOf(workspace, userId)) {
        return { ok: false, reason: 'Access denied: not a member of this workspace' };
    }
    return { ok: true, workspace, personal: false };
}

/**
 * Express middleware factory. Reads the workspace id from an explicit
 * param name, falling back to body.
 */
function requireWorkspaceAccess(paramName = 'workspaceId') {
    return async function workspaceAccessMiddleware(req, res, next) {
        try {
            const userId = req.userId || (req.user && (req.user.userId || req.user._id));
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const workspaceId =
                req.params[paramName] ||
                (req.body && (req.body[paramName] || req.body.companyId || req.body.company)) ||
                req.query[paramName];

            const result = await assertWorkspaceAccess(workspaceId, userId);
            if (!result.ok) {
                return res.status(403).json({ error: result.reason });
            }
            req.workspace = result.workspace;
            next();
        } catch (error) {
            console.error('Workspace access check error:', error);
            res.status(500).json({ error: 'Workspace access check failed' });
        }
    };
}

module.exports = {
    resolveWorkspace,
    isMemberOf,
    assertWorkspaceAccess,
    requireWorkspaceAccess,
};
