/**
 * Shared tenant-isolation primitive (audit rec 7).
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
 */

async function userIsCompanyMember(companyId, userId) {
    if (!companyId || !userId) return false;
    const Company = require('../models/Company');
    const company = await Company.findOne({
        _id: companyId,
        $or: [{ owner: userId }, { 'members.user': userId }]
    }).select('_id').lean();
    return !!company;
}

async function userCanAccessFile(file, userId) {
    if (!file || !userId) return false;
    const uid = userId.toString();
    const createdBy = file.createdBy?._id ? file.createdBy._id.toString() : file.createdBy?.toString?.();
    if (createdBy === uid) return true;
    if ((file.collaborators || []).some(c => {
        const id = c.user?._id ? c.user._id.toString() : c.user?.toString?.();
        return id === uid;
    })) return true;
    if (!file.company) return false;
    return userIsCompanyMember(file.company, userId);
}

// 404 when missing, 403 when present-but-foreign. Returns true when allowed.
async function assertFileAccess(file, userId, res) {
    if (!file) {
        res.status(404).json({ success: false, message: 'File not found' });
        return false;
    }
    if (!(await userCanAccessFile(file, userId))) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return false;
    }
    return true;
}

async function assertCompanyMembership(companyId, userId, res) {
    if (!(await userIsCompanyMember(companyId, userId))) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return false;
    }
    return true;
}

module.exports = {
    userIsCompanyMember,
    userCanAccessFile,
    assertFileAccess,
    assertCompanyMembership,
};
