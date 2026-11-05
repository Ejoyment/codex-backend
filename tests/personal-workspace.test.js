jest.mock('../models/Company', () => ({
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
}));
jest.mock('../models/User', () => ({
    findById: jest.fn(),
}));
jest.mock('../models/Subscription', () => ({
    findOne: jest.fn(),
}));

const Company = require('../models/Company');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { resolveWorkspaceForUser } = require('../utils/workspaceIdentity');

const USER_ID = '507f1f77bcf86cd799439011';

const sortChain = (value) => ({ sort: async () => value });
const leanChain = (value) => ({ select: () => ({ lean: async () => value }) });
const userChain = (value) => ({ select: async () => value });

function mockLookups({ existing = null, slugOwner = null } = {}) {
    Company.findOne.mockImplementation((query) => {
        if (query.slug) return leanChain(slugOwner);
        return sortChain(existing);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue(userChain({
        _id: USER_ID,
        fullName: 'Ranger',
        email: 'ranger@example.com',
        company: 'hud-sonn',
    }));
    Subscription.findOne.mockReturnValue(leanChain({ tier: 'developer' }));
});

test('returns an existing workspace without creating another', async () => {
    const existing = { _id: 'company-1', slug: 'hud-sonn' };
    mockLookups({ existing });

    const workspace = await ensurePersonalWorkspace(USER_ID);

    expect(workspace).toBe(existing);
    expect(Company.create).not.toHaveBeenCalled();
});

test('creates one free workspace from the onboarding company name', async () => {
    mockLookups();
    const created = { _id: 'company-2', slug: 'hud-sonn' };
    Company.create.mockResolvedValue(created);

    const workspace = await ensurePersonalWorkspace(USER_ID);

    expect(workspace).toBe(created);
    expect(Company.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'hud-sonn',
        slug: 'hud-sonn',
        owner: USER_ID,
        subscription: expect.objectContaining({
            tier: 'developer',
            memberLimit: 1,
        }),
        members: [expect.objectContaining({ user: USER_ID, role: 'owner' })],
    }));
});

test('suffixes the slug when another user already owns it', async () => {
    mockLookups({ slugOwner: { _id: 'other-company', owner: 'other-user' } });
    Company.create.mockResolvedValue({ _id: 'company-3', slug: 'hud-sonn-439011' });

    await ensurePersonalWorkspace(USER_ID);

    expect(Company.create).toHaveBeenCalledWith(expect.objectContaining({
        slug: 'hud-sonn-439011',
    }));
});

test('reuses the winner when concurrent creation hits the unique slug', async () => {
    mockLookups();
    const raced = { _id: 'company-4', slug: 'hud-sonn' };
    Company.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    Company.findOne
        .mockImplementationOnce(() => sortChain(null))
        .mockImplementationOnce(() => leanChain(null))
        .mockImplementationOnce(() => sortChain(raced));

    const workspace = await ensurePersonalWorkspace(USER_ID);

    expect(workspace).toBe(raced);
});

test('resolves the caller id alias to the personal Company id', async () => {
    const existing = {
        _id: '507f1f77bcf86cd799439012',
        owner: USER_ID,
        members: [{ user: USER_ID }],
    };
    mockLookups({ existing });

    const resolved = await resolveWorkspaceForUser(USER_ID, USER_ID);

    expect(resolved.personal).toBe(true);
    expect(String(resolved.workspace._id)).toBe(String(existing._id));
});

test('free tier can create its single workspace', () => {
    const permissionMatrix = require('../middleware/permissionMatrix');
    expect(permissionMatrix.scopes['company:create']).toContain('developer');
    expect(permissionMatrix.limits.developer.maxWorkspaces).toBe(1);
});
