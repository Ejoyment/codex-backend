jest.mock('../utils/agentChangeSet', () => ({
  applyExecutionChanges: jest.fn(),
  stageChanges: jest.fn(),
}));
jest.mock('../utils/gitService', () => ({
  withRepositoryLock: jest.fn((_workspaceId, _projectId, operation) => operation()),
  branches: jest.fn(),
  checkout: jest.fn(),
  getGit: jest.fn(),
  merge: jest.fn(),
  removeAgentWorktree: jest.fn(),
  init: jest.fn(),
  ensureBaseCommit: jest.fn(),
  createAgentWorktree: jest.fn(),
}));
jest.mock('../models/AgentExecution', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../models/LocalTask', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../utils/containerWorker', () => ({ teardownWorker: jest.fn() }));
jest.mock('../utils/sddVerificationService', () => ({ verifySpec: jest.fn() }));

const agentChangeSet = require('../utils/agentChangeSet');
const gitService = require('../utils/gitService');
const AgentExecution = require('../models/AgentExecution');
const { approveExecution } = require('../utils/agentApprovalService');

const WORKSPACE_ID = '7'.repeat(24);
const PROJECT_ID = '9'.repeat(24);
const EXECUTION_ID = 'a'.repeat(24);

jest.spyOn(global, 'setImmediate').mockImplementation(() => 0);

function execution(overrides = {}) {
  return {
    _id: EXECUTION_ID,
    status: 'awaiting_review',
    branch: 'feature/task',
    baseBranch: 'main',
    proposedChanges: [{ path: 'src/file.js', action: 'update', content: 'updated' }],
    filesChanged: ['src/file.js'],
    logs: [],
    save: jest.fn(async function () { return this; }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  AgentExecution.findOneAndUpdate.mockResolvedValue({ _id: EXECUTION_ID, status: 'approving' });
  gitService.branches.mockResolvedValue({ success: true, branches: ['main', 'feature/task'] });
  gitService.checkout.mockResolvedValue({ success: true });
  gitService.getGit.mockResolvedValue({ status: async () => ({ current: 'main' }) });
  gitService.merge.mockResolvedValue({ success: true });
  gitService.removeAgentWorktree.mockResolvedValue({ success: true });
  gitService.init.mockResolvedValue({ success: true });
  gitService.ensureBaseCommit.mockResolvedValue({ success: true });
  gitService.createAgentWorktree.mockResolvedValue({ success: true });
  agentChangeSet.applyExecutionChanges.mockResolvedValue({ applied: 1 });
  agentChangeSet.stageChanges.mockResolvedValue({ success: true, committed: true });
});

describe('approveExecution', () => {
  test('only one concurrent approval merges and applies changes', async () => {
    let signalBranchesRead;
    const branchesRead = new Promise((resolve) => { signalBranchesRead = resolve; });
    let releaseBranches;
    gitService.branches.mockImplementation(() => {
      signalBranchesRead();
      return new Promise((resolve) => { releaseBranches = resolve; });
    });
    let claimCount = 0;
    AgentExecution.findOneAndUpdate.mockImplementation(async () => (
      ++claimCount === 1 ? { _id: EXECUTION_ID, status: 'approving' } : null
    ));

    const doc = execution();
    const firstApproval = approveExecution({ execution: doc, userId: 'user-id', workspaceId: WORKSPACE_ID });
    await branchesRead;
    const secondApproval = await approveExecution({ execution: doc, userId: 'user-id', workspaceId: WORKSPACE_ID });
    releaseBranches({ success: true, branches: ['main'] });
    const firstResult = await firstApproval;

    expect(secondApproval).toMatchObject({ ok: false, status: 409 });
    expect(firstResult.ok).toBe(true);
    expect(gitService.merge).toHaveBeenCalledTimes(1);
    expect(agentChangeSet.applyExecutionChanges).toHaveBeenCalledTimes(1);
  });

  test('reclaims an approval claim that crashed past the 5-minute window', async () => {
    const stale = execution({
      status: 'approving',
      approvalStartedAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    AgentExecution.findOneAndUpdate.mockImplementation(async (filter) => (
      filter.status === 'approving' ? { _id: EXECUTION_ID, status: 'approving' } : null
    ));

    const result = await approveExecution({ execution: stale, userId: 'user-id', workspaceId: WORKSPACE_ID });

    expect(result.ok).toBe(true);
    expect(AgentExecution.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approving', approvalStartedAt: stale.approvalStartedAt }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'approving', approvalStartedAt: expect.any(Date) }) }),
      { new: true }
    );
  });

  test('does not reclaim a fresh approving claim', async () => {
    const fresh = execution({
      status: 'approving',
      approvalStartedAt: new Date(Date.now() - 30 * 1000),
    });
    AgentExecution.findOneAndUpdate.mockResolvedValue(null);

    const result = await approveExecution({ execution: fresh, userId: 'user-id', workspaceId: WORKSPACE_ID });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(AgentExecution.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $in: ['awaiting_review', 'awaiting_approval'] } }),
      expect.anything(),
      { new: true }
    );
  });

  test('does not apply project files when the Git merge fails', async () => {
    AgentExecution.findOneAndUpdate.mockResolvedValue({ _id: EXECUTION_ID, status: 'approving' });
    gitService.merge.mockResolvedValue({ success: false, error: 'merge conflict' });

    const result = await approveExecution({
      execution: execution(),
      userId: 'user-id',
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(agentChangeSet.applyExecutionChanges).not.toHaveBeenCalled();
  });

  test('reinitializes a missing local repository and restores the agent branch before merging', async () => {
    gitService.branches
      .mockResolvedValueOnce({ success: false, error: 'fatal: not a git repository' })
      .mockResolvedValueOnce({ success: true, branches: ['main'] });

    const result = await approveExecution({
      execution: execution({ projectId: PROJECT_ID }),
      userId: 'user-id',
      workspaceId: WORKSPACE_ID,
    });

    expect(result.ok).toBe(true);
    expect(gitService.init).toHaveBeenCalledWith(WORKSPACE_ID, {}, PROJECT_ID);
    expect(gitService.ensureBaseCommit).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'main',
      'Initialize project from VFS',
      PROJECT_ID
    );
    expect(gitService.createAgentWorktree).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'feature/task',
      'main',
      PROJECT_ID,
      EXECUTION_ID
    );
    expect(agentChangeSet.stageChanges).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.any(Array),
      expect.objectContaining({ branch: 'feature/task', projectId: PROJECT_ID, executionId: EXECUTION_ID })
    );
    expect(gitService.merge).toHaveBeenCalledWith(WORKSPACE_ID, 'feature/task', PROJECT_ID);
  });

  test('removes a restored branch when restoring its changes fails', async () => {
    gitService.branches
      .mockResolvedValueOnce({ success: false, error: 'fatal: not a git repository' })
      .mockResolvedValueOnce({ success: true, branches: ['main'] });
    agentChangeSet.stageChanges.mockResolvedValue({ success: false, error: 'could not stage changes' });

    const result = await approveExecution({
      execution: execution({ projectId: PROJECT_ID }),
      userId: 'user-id',
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(gitService.removeAgentWorktree).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PROJECT_ID,
      EXECUTION_ID,
      { branchName: 'feature/task', deleteBranch: true }
    );
    expect(gitService.merge).not.toHaveBeenCalled();
  });
});
