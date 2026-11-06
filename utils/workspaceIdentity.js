const mongoose = require('mongoose');
const Company = require('../models/Company');
const { findPersonalWorkspace, ensurePersonalWorkspace } = require('./personalWorkspace');

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
    if (!workspace || workspace.isActive === false) return null;
    if (!isMember(workspace, userId)) return null;
    return { workspace, personal: false };
}

async function canonicalWorkspaceId(workspaceId, userId) {
    const resolved = await resolveWorkspaceForUser(workspaceId, userId);
    return resolved ? String(resolved.workspace._id) : null;
}

module.exports = {
    normalizeWorkspaceId,
    isMember,
    resolveWorkspaceForUser,
    canonicalWorkspaceId,
};
