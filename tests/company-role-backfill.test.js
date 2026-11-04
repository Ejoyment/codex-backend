jest.mock('../models/Company', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  updateMany: jest.fn(),
}));

const Company = require('../models/Company');
const {
  scanMissingRoles,
  backfillMissingRoles,
  bulkPromoteMembers,
} = require('../server/services/companyRoleService');

function company(overrides = {}) {
  return {
    _id: 'company-1',
    name: 'Acme',
    owner: 'owner-1',
    members: [
      { user: 'owner-1', role: 'owner' },
      { user: 'legacy-1' },
      { user: 'invalid-1', role: 'superadmin' },
      { user: 'viewer-1', role: 'viewer' },
    ],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('company role backfill', () => {
  test('finds missing and invalid roles without treating valid roles as missing', async () => {
    Company.find.mockResolvedValue([company()]);

    await expect(scanMissingRoles()).resolves.toEqual([
      {
        companyId: 'company-1',
        name: 'Acme',
        missingMembers: ['legacy-1', 'invalid-1'],
      },
    ]);
  });

  test('dry-run reports affected rows but never writes', async () => {
    Company.find.mockResolvedValue([company()]);

    const result = await backfillMissingRoles({ dryRun: true });

    expect(result).toMatchObject({
      dryRun: true,
      companiesAffected: 1,
      affectedMembers: 2,
      updatedCompanies: 0,
    });
    expect(Company.findById).not.toHaveBeenCalled();
  });

  test('applies viewer to every missing/invalid role', async () => {
    const doc = company();
    Company.find.mockResolvedValue([doc]);
    Company.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await backfillMissingRoles({ dryRun: false });

    expect(Company.updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ['company-1'] },
        'members.role': { $nin: ['owner', 'admin', 'member', 'viewer'] },
      },
      { $set: { 'members.$[member].role': 'viewer' } },
      { arrayFilters: [{ 'member.role': { $nin: ['owner', 'admin', 'member', 'viewer'] } }] }
    );
    expect(doc.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: false, updatedCompanies: 1 });
  });
});

describe('bulk promotion', () => {
  test('dry-run lists only upward promotions and skips the owner', async () => {
    const doc = company();
    Company.findById.mockResolvedValue(doc);

    const result = await bulkPromoteMembers({
      companyId: 'company-1',
      userIds: ['legacy-1', 'viewer-1', 'owner-1', 'missing-1'],
      role: 'member',
      actorId: 'owner-1',
      dryRun: true,
    });

    expect(result.changes).toEqual([
      { userId: 'legacy-1', from: 'viewer', to: 'member' },
      { userId: 'viewer-1', from: 'viewer', to: 'member' },
    ]);
    expect(result.unchanged).toEqual([
      { userId: 'owner-1', reason: 'owner cannot be changed' },
      { userId: 'missing-1', reason: 'not a member' },
    ]);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('applies promotions and audits each changed member at the route layer', async () => {
    const doc = company();
    Company.findById.mockResolvedValue(doc);

    const result = await bulkPromoteMembers({
      companyId: 'company-1',
      userIds: ['legacy-1'],
      role: 'admin',
      actorId: 'owner-1',
      dryRun: false,
    });

    expect(doc.members.find((m) => m.user === 'legacy-1').role).toBe('admin');
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ dryRun: false, updated: 1 });
  });

  test('rejects a non-owner caller', async () => {
    Company.findById.mockResolvedValue(company());

    await expect(bulkPromoteMembers({
      companyId: 'company-1',
      userIds: ['viewer-1'],
      role: 'member',
      actorId: 'admin-1',
      dryRun: true,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('rejects invalid roles and empty target lists', async () => {
    await expect(bulkPromoteMembers({
      companyId: 'company-1',
      userIds: ['viewer-1'],
      role: 'owner',
      actorId: 'owner-1',
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(bulkPromoteMembers({
      companyId: 'company-1',
      userIds: [],
      role: 'member',
      actorId: 'owner-1',
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
