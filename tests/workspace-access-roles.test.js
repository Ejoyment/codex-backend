/**
 * E9 access-matrix tests.
 *
 * Company roles: owner/admin (read+write+manage), member (read+write),
 * viewer (read only). Explicit file collaborator grants are the narrowest
 * grant for members/viewers, but a viewer is capped before manage.
 */
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));
jest.mock('../utils/workspaceIdentity', () => ({ resolveWorkspaceForUser: jest.fn() }));

const Company = require('../models/Company');
const { resolveWorkspaceForUser } = require('../utils/workspaceIdentity');
const {
    resolveCompanyAccess,
    resolveFileAccess,
    userCanAccessFile,
    accessSatisfies,
} = require('../middleware/workspaceAccess');

const COMPANY_ID = '507f1f77bcf86cd799439022';
const OWNER = 'user-owner';
const ADMIN = 'user-admin';
const MEMBER = 'user-member';
const VIEWER = 'user-viewer';
const OUTSIDER = 'user-outsider';
const CREATOR = 'user-creator';

function lookupChain(doc) {
    return { select: () => ({ lean: async () => doc }) };
}

function companyDoc(overrides = {}) {
    return {
        _id: COMPANY_ID,
        owner: OWNER,
        members: [
            { user: OWNER, role: 'owner' },
            { user: ADMIN, role: 'admin' },
            { user: MEMBER, role: 'member' },
            { user: VIEWER, role: 'viewer' },
        ],
        ...overrides,
    };
}

function setCompany(doc) {
    if (!doc) {
        resolveWorkspaceForUser.mockResolvedValue(null);
        return;
    }
    resolveWorkspaceForUser.mockImplementation(async (_workspaceId, userId) => {
        const uid = String(userId);
        const member = String(doc.owner) === uid
            || (doc.members || []).some((entry) => String(entry.user) === uid);
        return member ? { workspace: doc, personal: false } : null;
    });
}

function fileOf(overrides = {}) {
    return {
        _id: 'file-1',
        company: COMPANY_ID,
        createdBy: CREATOR,
        collaborators: [],
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceForUser.mockResolvedValue(null);
    setCompany(companyDoc());
});

describe('resolveCompanyAccess role matrix', () => {
    test('owner can read, write and manage', async () => {
        const access = await resolveCompanyAccess(COMPANY_ID, OWNER);
        expect(access).toMatchObject({
            member: true,
            owner: true,
            role: 'owner',
            canRead: true,
            canWrite: true,
            canManage: true,
        });
    });

    test('admin can read, write and manage', async () => {
        const access = await resolveCompanyAccess(COMPANY_ID, ADMIN);
        expect(access).toMatchObject({
            member: true,
            owner: false,
            role: 'admin',
            canRead: true,
            canWrite: true,
            canManage: true,
        });
    });

    test('member can read and write but cannot manage', async () => {
        const access = await resolveCompanyAccess(COMPANY_ID, MEMBER);
        expect(access).toMatchObject({
            member: true,
            owner: false,
            role: 'member',
            canRead: true,
            canWrite: true,
            canManage: false,
        });
    });

    test('viewer is read-only', async () => {
        const access = await resolveCompanyAccess(COMPANY_ID, VIEWER);
        expect(access).toMatchObject({
            member: true,
            owner: false,
            role: 'viewer',
            canRead: true,
            canWrite: false,
            canManage: false,
        });
    });

    test('a member row without a role fails closed to viewer', async () => {
        setCompany(companyDoc({ members: [{ user: MEMBER }] }));
        const access = await resolveCompanyAccess(COMPANY_ID, MEMBER);
        expect(access.role).toBe('viewer');
        expect(access.canWrite).toBe(false);
        expect(access.canManage).toBe(false);
    });

    test('an unknown role fails closed to viewer', async () => {
        setCompany(companyDoc({ members: [{ user: MEMBER, role: 'superuser' }] }));
        const access = await resolveCompanyAccess(COMPANY_ID, MEMBER);
        expect(access.role).toBe('viewer');
        expect(access.canManage).toBe(false);
    });

    test('a non-member gets no access', async () => {
        setCompany(null);
        const access = await resolveCompanyAccess(COMPANY_ID, OUTSIDER);
        expect(access).toEqual({
            member: false,
            owner: false,
            role: null,
            canRead: false,
            canWrite: false,
            canManage: false,
        });
    });

    test('the personal workspace alias resolves as owner', async () => {
        resolveWorkspaceForUser.mockResolvedValue({
            personal: true,
            workspace: {
                _id: OWNER,
                owner: OWNER,
                members: [{ user: OWNER, role: 'owner' }],
            },
        });

        const access = await resolveCompanyAccess(OWNER, OWNER);
        expect(access.role).toBe('owner');
        expect(access.canManage).toBe(true);
        expect(resolveWorkspaceForUser).toHaveBeenCalledWith(OWNER, OWNER);
    });

    test('resolves membership through the canonical workspace identity', async () => {
        await resolveCompanyAccess(COMPANY_ID, MEMBER);
        expect(resolveWorkspaceForUser).toHaveBeenCalledWith(COMPANY_ID, MEMBER);
    });
});

describe('file access with company roles and collaborator rows', () => {
    test('the creator keeps full control even as a viewer', async () => {
        const access = await resolveFileAccess(fileOf({ createdBy: VIEWER }), VIEWER);
        expect(access.creator).toBe(true);
        expect(access.canRead).toBe(true);
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(true);
    });

    test('a company owner keeps manage despite a read-only collaborator row', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: OWNER, permission: 'read' }] }),
            OWNER
        );
        expect(access.canManage).toBe(true);
        expect(access.canWrite).toBe(true);
    });

    test('a company admin keeps manage despite a read-only collaborator row', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: ADMIN, permission: 'read' }] }),
            ADMIN
        );
        expect(access.canRead).toBe(true);
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(true);
    });

    test('a member without a collaborator row can write but not manage', async () => {
        const access = await resolveFileAccess(fileOf(), MEMBER);
        expect(access).toMatchObject({ role: 'member', canRead: true, canWrite: true, canManage: false });
    });

    test('an explicit read row narrows a member to read-only', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: MEMBER, permission: 'read' }] }),
            MEMBER
        );
        expect(access.canRead).toBe(true);
        expect(access.canWrite).toBe(false);
        expect(access.canManage).toBe(false);
    });

    test('an explicit write row lets a member write but not manage', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: MEMBER, permission: 'write' }] }),
            MEMBER
        );
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(false);
    });

    test('an explicit admin row lets a member manage', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: MEMBER, permission: 'admin' }] }),
            MEMBER
        );
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(true);
    });

    test('a viewer without a collaborator row cannot write', async () => {
        const access = await resolveFileAccess(fileOf(), VIEWER);
        expect(access).toMatchObject({ role: 'viewer', canRead: true, canWrite: false, canManage: false });
    });

    test('an explicit write row lets a viewer write but never manage', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: VIEWER, permission: 'write' }] }),
            VIEWER
        );
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(false);
    });

    test('an explicit admin row is capped to read/write for a viewer', async () => {
        const access = await resolveFileAccess(
            fileOf({ collaborators: [{ user: VIEWER, permission: 'admin' }] }),
            VIEWER
        );
        expect(access.canWrite).toBe(true);
        expect(access.canManage).toBe(false);
        expect(await userCanAccessFile(
            fileOf({ collaborators: [{ user: VIEWER, permission: 'admin' }] }),
            VIEWER,
            'manage'
        )).toBe(false);
    });

    test('an outside collaborator receives the explicit grant', async () => {
        const writeAccess = await resolveFileAccess(
            fileOf({ collaborators: [{ user: OUTSIDER, permission: 'write' }] }),
            OUTSIDER
        );
        expect(writeAccess.canWrite).toBe(true);
        expect(writeAccess.canManage).toBe(false);

        const adminAccess = await resolveFileAccess(
            fileOf({ collaborators: [{ user: OUTSIDER, permission: 'admin' }] }),
            OUTSIDER
        );
        expect(adminAccess.canManage).toBe(true);
    });

    test('a non-member without a collaborator row is denied', async () => {
        setCompany(companyDoc({ members: [{ user: VIEWER, role: 'viewer' }] }));
        const access = await resolveFileAccess(fileOf(), MEMBER);
        expect(access.canRead).toBe(false);
        expect(access.canWrite).toBe(false);
        expect(access.canManage).toBe(false);
    });

    test('accessSatisfies maps legacy admin to manage and fails closed on unknown', () => {
        const manage = { canRead: true, canWrite: true, canManage: true };
        expect(accessSatisfies(manage, 'admin')).toBe(true);
        expect(accessSatisfies(manage, 'manage')).toBe(true);
        expect(accessSatisfies({ canRead: true, canWrite: false, canManage: false }, 'write')).toBe(false);
        expect(accessSatisfies(manage, 'unknown')).toBe(false);
    });
});
