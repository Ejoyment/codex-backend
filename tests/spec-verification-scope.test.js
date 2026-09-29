/**
 * A spec validates against the code of its own project.
 *
 * A project inside a workspace validates against that workspace's VFS. A solo
 * project has no workspace, so it falls back to the files its owner created —
 * otherwise every solo spec would verify against an empty file set.
 */

const mockProjectLean = jest.fn();
const mockCodeFileFind = jest.fn();
const mockCodeFileFindOne = jest.fn();

jest.mock('../models/LocalProject', () => ({
  findById: jest.fn(() => ({ select: () => ({ lean: mockProjectLean }) }))
}));

jest.mock('../models/CodeFile', () => ({
  find: jest.fn((...args) => mockCodeFileFind(...args)),
  findOne: jest.fn((...args) => mockCodeFileFindOne(...args))
}));

const sddVerificationService = require('../utils/sddVerificationService');

const OWNER = '507f1f77bcf86cd799439011';
const WORKSPACE = '507f191e810c19729de860ea';
const PROJECT = '507f1f77bcf86cd799439012';

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectLean.mockResolvedValue(null);
  mockCodeFileFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockCodeFileFindOne.mockReturnValue({ select: () => null });
});

describe('resolveSpecCodeScope', () => {
  test('uses the workspace VFS when the project has one', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, workspaceId: WORKSPACE });

    await expect(sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT })).resolves.toEqual({ company: WORKSPACE });
  });

  test('falls back to the project owner for a solo project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, workspaceId: null });

    await expect(sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT })).resolves.toEqual({ createdBy: OWNER });
  });

  test("prefers the spec's own workspace", async () => {
    await expect(sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT, workspaceId: WORKSPACE })).resolves.toEqual({ company: WORKSPACE });
    expect(mockProjectLean).not.toHaveBeenCalled();
  });

  test('a project with no owner resolves to no scope', async () => {
    mockProjectLean.mockResolvedValue({ userId: null, workspaceId: null });

    await expect(sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT })).resolves.toBeNull();
  });

  test('a spec with no project resolves to no scope', async () => {
    await expect(sddVerificationService.resolveSpecCodeScope({})).resolves.toBeNull();
    await expect(sddVerificationService.resolveSpecCodeScope(null)).resolves.toBeNull();
  });
});

describe('getSpecCodeFiles', () => {
  test('reads the workspace files for a collaborative project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, workspaceId: WORKSPACE });

    const files = await sddVerificationService.getSpecCodeFiles({ projectId: PROJECT });

    expect(mockCodeFileFind).toHaveBeenCalledWith({ company: WORKSPACE });
    expect(files).toEqual([]);
  });

  test('reads the owner files for a solo project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, workspaceId: null });

    await sddVerificationService.getSpecCodeFiles({ projectId: PROJECT });

    expect(mockCodeFileFind).toHaveBeenCalledWith({ createdBy: OWNER });
  });

  test('queries nothing when there is no scope', async () => {
    await expect(sddVerificationService.getSpecCodeFiles({})).resolves.toEqual([]);
    expect(mockCodeFileFind).not.toHaveBeenCalled();
  });
});

describe('findSpecCodeFile', () => {
  test('scopes the path lookup to the project', async () => {
    mockProjectLean.mockResolvedValue({ userId: OWNER, workspaceId: null });

    await sddVerificationService.findSpecCodeFile({ projectId: PROJECT }, 'src/auth.js');

    expect(mockCodeFileFindOne).toHaveBeenCalledWith({ createdBy: OWNER, path: 'src/auth.js' });
  });

  test('never reads a file outside the project scope', async () => {
    await expect(sddVerificationService.findSpecCodeFile({}, 'src/auth.js')).resolves.toBeNull();
    expect(mockCodeFileFindOne).not.toHaveBeenCalled();
  });
});
