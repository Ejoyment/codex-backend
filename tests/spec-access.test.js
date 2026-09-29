/**
 * Spec access is project-level.
 *
 * A spec belongs to a project, so access follows the project — not a workspace.
 * A solo developer with no workspace must get the full spec workflow; a
 * workspace only layers collaboration on top.
 */

const mockProjectLean = jest.fn();
const mockCompanyLean = jest.fn();
const mockProjectListLean = jest.fn();
const mockProjectSort = jest.fn();
const mockCompanyListLean = jest.fn();
const mockSpecFind = jest.fn();

jest.mock('../models/LocalProject', () => ({
  findById: jest.fn(() => ({ select: () => ({ lean: mockProjectLean }) })),
  find: jest.fn(() => {
    const query = {
      select: () => query,
      lean: () => mockProjectListLean(),
      sort: () => mockProjectSort()
    };
    return query;
  })
}));

jest.mock('../models/Company', () => ({
  findById: jest.fn(() => ({ select: () => ({ lean: mockCompanyLean }) })),
  find: jest.fn(() => {
    const query = { select: () => query, lean: () => mockCompanyListLean() };
    return query;
  })
}));

jest.mock('../models/SpecModel', () => ({
  find: jest.fn((...args) => mockSpecFind(...args))
}));

const { userCanAccessProject, userCanAccessSpec, userCanAccessWorkspace, getAccessibleProjects, getSpecWorkspaceId, getWorkspaceProjectIds, resolveAccessibleSpecs } = require('../utils/specAccess');

const OWNER = 'user-owner';
const MEMBER = 'user-member';
const WS_OWNER = 'ws-owner';
const WS_MEMBER = 'ws-member';
const STRANGER = 'user-stranger';
const PROJECT_ID = 'proj-1';
const WORKSPACE_ID = 'ws-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectLean.mockResolvedValue(null);
  mockCompanyLean.mockResolvedValue(null);
  mockProjectListLean.mockResolvedValue([]);
  mockProjectSort.mockResolvedValue([]);
  mockCompanyListLean.mockResolvedValue([]);
  mockSpecFind.mockResolvedValue([]);
});

describe('userCanAccessProject', () => {
  test('project owner can access without any workspace', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });

    await expect(userCanAccessProject(PROJECT_ID, OWNER)).resolves.toBe(true);
    expect(mockCompanyLean).not.toHaveBeenCalled();
  });

  test('a workspace is never required for the owner', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockCompanyLean.mockResolvedValue(null);

    await expect(userCanAccessProject(PROJECT_ID, OWNER)).resolves.toBe(true);
  });

  test('project member can access', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [MEMBER], workspaceId: null });

    await expect(userCanAccessProject(PROJECT_ID, MEMBER)).resolves.toBe(true);
  });

  test('workspace owner can access a project inside their workspace', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: WORKSPACE_ID });
    mockCompanyLean.mockResolvedValue({ owner: WS_OWNER, members: [] });

    await expect(userCanAccessProject(PROJECT_ID, WS_OWNER)).resolves.toBe(true);
  });

  test('workspace member can access a project inside their workspace', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: WORKSPACE_ID });
    mockCompanyLean.mockResolvedValue({ owner: WS_OWNER, members: [{ user: WS_MEMBER }] });

    await expect(userCanAccessProject(PROJECT_ID, WS_MEMBER)).resolves.toBe(true);
  });

  test('unrelated user is denied', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [MEMBER], workspaceId: WORKSPACE_ID });
    mockCompanyLean.mockResolvedValue({ owner: WS_OWNER, members: [{ user: WS_MEMBER }] });

    await expect(userCanAccessProject(PROJECT_ID, STRANGER)).resolves.toBe(false);
  });

  test('missing project denies', async () => {
    mockProjectLean.mockResolvedValue(null);

    await expect(userCanAccessProject(PROJECT_ID, OWNER)).resolves.toBe(false);
  });

  test('missing identifiers deny', async () => {
    await expect(userCanAccessProject(null, OWNER)).resolves.toBe(false);
    await expect(userCanAccessProject(PROJECT_ID, null)).resolves.toBe(false);
  });
});

describe('userCanAccessSpec', () => {
  test('follows the spec project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });

    await expect(userCanAccessSpec({ projectId: PROJECT_ID }, OWNER)).resolves.toBe(true);
    await expect(userCanAccessSpec({ projectId: PROJECT_ID }, STRANGER)).resolves.toBe(false);
  });

  test('null spec denies', async () => {
    await expect(userCanAccessSpec(null, OWNER)).resolves.toBe(false);
  });
});

describe('userCanAccessWorkspace', () => {
  test('owner and member pass, stranger does not', async () => {
    mockCompanyLean.mockResolvedValue({ owner: WS_OWNER, members: [{ user: WS_MEMBER }] });

    await expect(userCanAccessWorkspace(WORKSPACE_ID, WS_OWNER)).resolves.toBe(true);
    await expect(userCanAccessWorkspace(WORKSPACE_ID, WS_MEMBER)).resolves.toBe(true);
    await expect(userCanAccessWorkspace(WORKSPACE_ID, STRANGER)).resolves.toBe(false);
  });
});

describe('getAccessibleProjects', () => {
  const HEX_USER = '507f1f77bcf86cd799439011';

  test('lists owned, member and workspace projects', async () => {
    const LocalProject = require('../models/LocalProject');
    mockCompanyListLean.mockResolvedValue([{ _id: WORKSPACE_ID }]);
    mockProjectSort.mockResolvedValue([{ _id: 'owned' }, { _id: 'shared' }]);

    const result = await getAccessibleProjects(HEX_USER);

    expect(result).toHaveLength(2);
    const filter = LocalProject.find.mock.calls[0][0];
    expect(filter.isArchived).toBe(false);
    expect(filter.$or).toEqual(
      expect.arrayContaining([{ userId: expect.anything() }, { members: expect.anything() }])
    );
    expect(filter.$or.some((clause) => clause.workspaceId)).toBe(true);
  });

  test('omits the workspace clause when the user is in no workspace', async () => {
    const LocalProject = require('../models/LocalProject');
    mockCompanyListLean.mockResolvedValue([]);
    mockProjectSort.mockResolvedValue([{ _id: 'owned' }]);

    await getAccessibleProjects(HEX_USER);

    const filter = LocalProject.find.mock.calls[0][0];
    expect(filter.$or).toHaveLength(2);
    expect(filter.$or.some((clause) => clause.workspaceId)).toBe(false);
  });

  test('no user means no projects', async () => {
    await expect(getAccessibleProjects(null)).resolves.toEqual([]);
  });

  test('an uncastable id yields no projects instead of throwing', async () => {
    await expect(getAccessibleProjects('not-an-object-id')).resolves.toEqual([]);
  });
});

describe('getSpecWorkspaceId', () => {
  test('prefers the spec own workspace', async () => {
    await expect(getSpecWorkspaceId({ workspaceId: 'ws-own', projectId: PROJECT_ID })).resolves.toBe('ws-own');
    expect(mockProjectLean).not.toHaveBeenCalled();
  });

  test('falls back to the parent project workspace', async () => {
    mockProjectLean.mockResolvedValue({ workspaceId: WORKSPACE_ID });

    await expect(getSpecWorkspaceId({ projectId: PROJECT_ID })).resolves.toBe(WORKSPACE_ID);
  });

  test('solo project resolves to no workspace', async () => {
    mockProjectLean.mockResolvedValue({ workspaceId: null });

    await expect(getSpecWorkspaceId({ projectId: PROJECT_ID })).resolves.toBeNull();
  });
});

describe('getWorkspaceProjectIds', () => {
  test('returns the workspace project ids', async () => {
    mockProjectListLean.mockResolvedValue([{ _id: 'a' }, { _id: 'b' }]);

    await expect(getWorkspaceProjectIds(WORKSPACE_ID)).resolves.toEqual(['a', 'b']);
  });
});

describe('resolveAccessibleSpecs', () => {
  test('empty list is valid', async () => {
    await expect(resolveAccessibleSpecs([], { projectId: PROJECT_ID, userId: OWNER })).resolves.toEqual({ ok: true, specs: [] });
  });

  test('accepts specs that belong to the task project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockSpecFind.mockResolvedValue([{ _id: 's1', projectId: PROJECT_ID }]);

    const result = await resolveAccessibleSpecs(['s1'], { projectId: PROJECT_ID, userId: OWNER });
    expect(result.ok).toBe(true);
    expect(result.specs).toHaveLength(1);
  });

  test('rejects a spec from another project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockSpecFind.mockResolvedValue([{ _id: 's1', projectId: 'other-project' }]);

    const result = await resolveAccessibleSpecs(['s1'], { projectId: PROJECT_ID, userId: OWNER });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/do not belong to this project/i);
  });

  test('rejects a user who cannot reach the project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockSpecFind.mockResolvedValue([{ _id: 's1', projectId: PROJECT_ID }]);

    const result = await resolveAccessibleSpecs(['s1'], { projectId: PROJECT_ID, userId: STRANGER });
    expect(result.ok).toBe(false);
  });

  test('rejects unknown spec ids', async () => {
    mockSpecFind.mockResolvedValue([]);

    const result = await resolveAccessibleSpecs(['s1'], { projectId: PROJECT_ID, userId: OWNER });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  test('without a project id each spec is checked individually', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockSpecFind.mockResolvedValue([{ _id: 's1', projectId: PROJECT_ID }]);

    const result = await resolveAccessibleSpecs(['s1'], { userId: OWNER });
    expect(result.ok).toBe(true);
  });

  test('without a project id an inaccessible spec is rejected', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, members: [], workspaceId: null });
    mockSpecFind.mockResolvedValue([{ _id: 's1', projectId: PROJECT_ID }]);

    const result = await resolveAccessibleSpecs(['s1'], { userId: STRANGER });
    expect(result.ok).toBe(false);
  });
});
