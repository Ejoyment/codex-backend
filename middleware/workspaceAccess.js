/**
 * Shared tenant-isolation primitive (audit rec 7 / E9).
 *
 * Centralizes the ownership checks that routes previously hand-rolled with
 * drift (or skipped entirely — see the code-editor IDOR). Usage:
 *
 *   const { assertCompanyMembership, assertFileAccess } = require('../middleware/workspaceAccess');
 *
 *   if (!(await assertCompanyMembership(workspaceId, req.userId, res))) return;
 *   if (!(await assertFileAccess(file, req.userId, res))) return;
 *
 * Convention: 404 when the object doesn't exist, 403 when it exists but is
 * foreign (matches meetings.js/messaging.js 'Access denied').
 *
 * Company roles are explicit:
 *   owner/admin -> read + write + manage
 *   member      -> read + write
 *   viewer      -> read only
 *
 * File grants are layered on top of the company role:
 *   - The file creator and a company owner/admin keep full control.
 *   - An explicit collaborator row is the narrowest grant for everyone else.
 *     It can widen a member to file-manage via `admin`, but a viewer is capped
 *     at read/write even when the stored collaborator permission is `admin`
 *     (a viewer must never gain file-management rights). Unknown roles are
 *     treated as viewer (least privilege).
 */

const { resolveWorkspaceForUser } = require('../utils/workspaceIdentity');

const COMPANY_ROLE_PERMISSIONS = Object.freeze({
    owner: Object.freeze({ canRead: true, canWrite: true, canManage: true }),
    admin: Object.freeze({ canRead: true, canWrite: true, canManage: true }),
    member: Object.freeze({ canRead: true, canWrite: true, canManage: false }),
    viewer: Object.freeze({ canRead: true, canWrite: false, canManage: false }),
});

const FILE_PERMISSION_CAPABILITIES = Object.freeze({
    read: Object.freeze({ canRead: true, canWrite: false, canManage: false }),
    write: Object.freeze({ canRead: true, canWrite: true, canManage: false }),
    admin: Object.freeze({ canRead: true, canWrite: true, canManage: true }),
});

function idString(value) {
    if (!value) return null;
    if (value._id) return String(value._id);
    return String(value);
}

function deniedAccess() {
    return {
        member: false,
        owner: false,
        role: null,
        canRead: false,
        canWrite: false,
        canManage: false,
    };
}

function accessForRole(role, { member = true, owner = false } = {}) {
    const capabilities = COMPANY_ROLE_PERMISSIONS[role];
    if (!capabilities) return { ...deniedAccess(), member, owner };
    return { member, owner, role, ...capabilities };
}

function normalizeCompanyRole(role) {
    return COMPANY_ROLE_PERMISSIONS[role] ? role : 'viewer';
}

function memberRoleFor(workspace, uid) {
    if (!workspace) return null;
    if (idString(workspace.owner) === uid) return 'owner';
    const member = (workspace.members || []).find((entry) => idString(entry?.user) === uid);
    return member ? normalizeCompanyRole(member.role) : null;
}

function normalizeFilePermission(permission) {
    return FILE_PERMISSION_CAPABILITIES[permission] ? permission : 'read';
}

function collaboratorPermissionFor(file, uid) {
    const collaborator = (file?.collaborators || []).find((entry) => idString(entry?.user) === uid);
    return collaborator ? normalizeFilePermission(collaborator.permission) : null;
}

function accessSatisfies(access, requiredPermission = 'read') {
    if (!access) return false;
    if (requiredPermission === 'read') return Boolean(access.canRead);
    if (requiredPermission === 'write') return Boolean(access.canWrite);
    // 'admin' is the legacy file-permission name for the same capability.
    if (requiredPermission === 'manage' || requiredPermission === 'admin') {
        return Boolean(access.canManage);
    }
    return false;
}

async function resolveCompanyAccess(companyId, userId) {
    if (!companyId || !userId) return deniedAccess();
    const uid = String(userId);

    if (String(companyId) === uid) {
        const resolved = await resolveWorkspaceForUser(companyId, userId);
        if (!resolved) return deniedAccess();
        const role = memberRoleFor(resolved.workspace, uid);
        if (!role) return deniedAccess();
        return accessForRole(role, {
            member: true,
            owner: idString(resolved.workspace.owner) === uid,
        });
    }

    if (!require('mongoose').Types.ObjectId.isValid(companyId)) return deniedAccess();
    const Company = require('../models/Company');
    const company = await Company.findOne({
        _id: companyId,
        $or: [{ owner: userId }, { 'members.user': userId }]
    }).select('_id owner members').lean();
    if (!company) return deniedAccess();

    let role = memberRoleFor(company, uid);
    // The membership query is authoritative; a partial/legacy projection may
    // omit `members`. Keep membership true but grant only viewer rights.
    if (!role && !Array.isArray(company.members)) role = 'viewer';
    if (!role) return deniedAccess();
    return accessForRole(role, {
        member: true,
        owner: idString(company.owner) === uid,
    });
}

async function userIsCompanyMember(companyId, userId) {
    return (await resolveCompanyAccess(companyId, userId)).member;
}

async function userIsCompanyOwner(companyId, userId) {
    return (await resolveCompanyAccess(companyId, userId)).owner;
}

/**
 * Effective file access. The returned object is the same company-access shape
 * plus `creator` and `collaboratorPermission`, so callers can render controls
 * without re-deriving the rules.
 */
async function resolveFileAccess(file, userId) {
    const denied = {
        ...deniedAccess(),
        creator: false,
        collaboratorPermission: null,
    };
    if (!file || !userId) return denied;

    const uid = String(userId);
    const companyAccess = file.company
        ? await resolveCompanyAccess(file.company, userId)
        : deniedAccess();
    const creator = idString(file.createdBy) === uid;
    const collaboratorPermission = collaboratorPermissionFor(file, uid);
    const base = {
        ...companyAccess,
        creator,
        collaboratorPermission,
    };

    // The creator always keeps full control over their own file.
    if (creator) {
        return {
            ...base,
            canRead: true,
            canWrite: true,
            canManage: true,
        };
    }

    if (!file.company) {
        if (!collaboratorPermission) return denied;
        return {
            ...base,
            member: false,
            owner: false,
            role: null,
            ...FILE_PERMISSION_CAPABILITIES[collaboratorPermission],
        };
    }

    // Workspace owners/admins manage every file in their workspace. A
    // collaborator row cannot lock an admin out of a file they administer.
    if (companyAccess.role === 'owner' || companyAccess.role === 'admin') {
        return {
            ...base,
            canRead: true,
            canWrite: true,
            canManage: true,
        };
    }

    // For members/viewers (and explicit outside collaborators), the file row
    // is the narrowest grant. A viewer never receives manage from an `admin`
    // file row.
    if (collaboratorPermission) {
        const capabilities = FILE_PERMISSION_CAPABILITIES[collaboratorPermission];
        return {
            ...base,
            canRead: capabilities.canRead,
            canWrite: capabilities.canWrite,
            canManage: companyAccess.role === 'viewer' ? false : capabilities.canManage,
        };
    }

    return base;
}

async function userCanAccessFile(file, userId, requiredPermission = 'read') {
    return accessSatisfies(await resolveFileAccess(file, userId), requiredPermission);
}

// 404 when missing, 403 when present-but-foreign. Returns true when allowed.
// Mutating routes must pass the permission they require; reads default to read.
async function assertFileAccess(file, userId, res, requiredPermission = 'read') {
    if (!file) {
        res.status(404).json({ success: false, message: 'File not found' });
        return false;
    }
    if (!(await userCanAccessFile(file, userId, requiredPermission))) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return false;
    }
    return true;
}

async function assertCompanyAccess(companyId, userId, res, requiredPermission = 'read') {
    if (!accessSatisfies(await resolveCompanyAccess(companyId, userId), requiredPermission)) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return false;
    }
    return true;
}

async function assertCompanyMembership(companyId, userId, res) {
    return assertCompanyAccess(companyId, userId, res, 'read');
}

module.exports = {
    COMPANY_ROLE_PERMISSIONS,
    resolveCompanyAccess,
    resolveFileAccess,
    accessSatisfies,
    userIsCompanyMember,
    userIsCompanyOwner,
    userCanAccessFile,
    assertFileAccess,
    assertCompanyAccess,
    assertCompanyMembership,
};
