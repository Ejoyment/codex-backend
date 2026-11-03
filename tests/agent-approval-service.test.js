jest.mock('../utils/agentChangeSet', () => ({ applyExecutionChanges: jest.fn() }));
jest.mock('../utils/gitService', () => ({
  withRepositoryLock: jest.fn((_workspaceId, _projectId, operation) => operation()),
  branches: jest.fn(),
  checkout: jest.fn(),
  getGit: jest.fn(),
  merge: jest.fn(),
  removeAgentWorktree: jest.fn(),
}));
jest.mock('../models/AgentExecution', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../models/LocalTask', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../utils/containerWorker', () => ({ teardownWorker: jest.fn() }));
jest.mock('../utils/sddVerificationService', () => ({ verifySpec: jest.fn() }));

const agentChangeSet = require('../utils/agentChangeSet');
const gitService = require('../utils/gitService');
const AgentExecution = require('../models/AgentExecution');
const { approveExecution } = require('../utils/agentApprovalService');

function execution() {
  return {
    _id: 'execution-id',
    status: 'awaiting_review',
    branch: 'feature/task',
    baseBranch: 'main',
    proposedChanges: [{ path: 'src/file.js', action: 'update', content: 'updated' }],
    filesChanged: ['src/file.js'],
    logs: [],
    save: jest.fn(async function () { return this; }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  gitService.branches.mockResolvedValue({ success: true, branches: ['main'] });
  gitService.checkout.mockResolvedValue({ success: true });
  gitService.getGit.mockResolvedValue({ status: async () => ({ current: 'main' }) });
  gitService.merge.mockResolvedValue({ success: true });
  gitService.removeAgentWorktree.mockResolvedValue({ success: true });
  agentChangeSet.applyExecutionChanges.mockResolvedValue({ applied: 1 });
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
      ++claimCount === 1 ? { _id: 'execution-id', status: 'approving' } : null
    ));

    const doc = execution();
    const firstApproval = approveExecution({ execution: doc, userId: 'user-id', workspaceId: 'workspace-id' });
    await branchesRead;
    const secondApproval = await approveExecution({ execution: doc, userId: 'user-id', workspaceId: 'workspace-id' });
    releaseBranches({ success: true, branches: ['main'] });
    const firstResult = await firstApproval;

    expect(secondApproval).toMatchObject({ ok: false, status: 409 });
    expect(firstResult.ok).toBe(true);
    expect(gitService.merge).toHaveBeenCalledTimes(1);
    expect(agentChangeSet.applyExecutionChanges).toHaveBeenCalledTimes(1);
  });

  test('does not apply project files when the Git merge fails', async () => {
    AgentExecution.findOneAndUpdate.mockResolvedValue({ _id: 'execution-id', status: 'approving' });
    gitService.merge.mockResolvedValue({ success: false, error: 'merge conflict' });

    const result = await approveExecution({
      execution: execution(),
      userId: 'user-id',
      workspaceId: 'workspace-id',
    });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(agentChangeSet.applyExecutionChanges).not.toHaveBeenCalled();
  });
});
