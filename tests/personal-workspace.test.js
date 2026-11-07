jest.mock('../models/Subscription', () => {
    const mockSub = jest.fn(function(data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
    });
    mockSub.findOne = jest.fn();
    return mockSub;
});
jest.mock('../models/User', () => ({
    findById: jest.fn(),
}));
jest.mock('../models/Company', () => ({
    findById: jest.fn(),
    findOne: jest.fn(),
}));

const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Company = require('../models/Company');
const { ensurePersonalWorkspace, findPersonalWorkspace } = require('../utils/personalWorkspace');
const { resolveWorkspaceForUser, resolveWorkspaceScope } = require('../utils/workspaceIdentity');

const companyQuery = (result) => ({
    select: () => ({ lean: async () => result }),
});

const USER_ID = '507f1f77bcf86cd799439011';

beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockResolvedValue({
        _id: USER_ID,
        fullName: 'Ranger',
        email: 'ranger@example.com',
    });
    Subscription.findOne.mockResolvedValue(null);
    Company.findById.mockReturnValue(companyQuery(null));
});

test('creates a personal subscription (not a company) for a new user', async () => {
    let capturedData;
    Subscription.mockImplementation(function(data) {
        capturedData = data;
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
    });

    const workspace = await ensurePersonalWorkspace(USER_ID);

    expect(capturedData.userId).toBe(USER_ID);
    expect(capturedData.type).toBe('personal');
    expect(workspace.userId).toBe(USER_ID);
    expect(workspace.type).toBe('personal');
    expect(workspace.save).toHaveBeenCalled();
});

test('returns existing personal subscription without creating another', async () => {
    const existing = { _id: 'sub-1', userId: USER_ID, type: 'personal', tier: 'pro' };
    Subscription.findOne.mockResolvedValue(existing);

    const workspace = await ensurePersonalWorkspace(USER_ID);

    expect(workspace).toBe(existing);
    expect(Subscription).not.toHaveBeenCalled();
});

test('resolves caller id alias to personal subscription', async () => {
    const existing = { _id: 'sub-5', userId: USER_ID, type: 'personal', tier: 'developer' };
    Subscription.findOne.mockResolvedValue(existing);

    const resolved = await resolveWorkspaceForUser(USER_ID, USER_ID);

    expect(resolved.personal).toBe(true);
    expect(String(resolved.workspace._id)).toBe(String(existing._id));
});

test('creates a personal workspace when none exists', async () => {
    Subscription.findOne.mockResolvedValue(null);

    const resolved = await resolveWorkspaceForUser(USER_ID, USER_ID);
    expect(resolved).not.toBeNull();
    expect(resolved.personal).toBe(true);
    expect(String(resolved.workspace._id)).toBeDefined();
    expect(Subscription).toHaveBeenCalled();
});

test('resolves the personal subscription id to the same personal scope', async () => {
    const existing = { _id: 'sub-7', userId: USER_ID, type: 'personal' };
    Subscription.findOne.mockResolvedValue(existing);

    const scope = await resolveWorkspaceScope('sub-7', USER_ID);

    expect(scope.ok).toBe(true);
    expect(scope.personal).toBe(true);
    expect(scope.workspaceId).toBe('sub-7');
});

test('stale workspace ids fall back to personal when allowed', async () => {
    const existing = { _id: 'sub-8', userId: USER_ID, type: 'personal' };
    Subscription.findOne.mockResolvedValue(existing);

    const scope = await resolveWorkspaceScope('507f1f77bcf86cd799439012', USER_ID, {
        fallbackToPersonal: true,
    });

    expect(scope.ok).toBe(true);
    expect(scope.personal).toBe(true);
    expect(scope.workspaceId).toBe('sub-8');
});

test('foreign workspace ids are rejected without the personal fallback', async () => {
    Subscription.findOne.mockResolvedValue({ _id: 'sub-9', userId: USER_ID, type: 'personal' });

    const scope = await resolveWorkspaceScope('507f1f77bcf86cd799439012', USER_ID);

    expect(scope.ok).toBe(false);
    expect(scope.reason).toMatch(/access denied/i);
});
