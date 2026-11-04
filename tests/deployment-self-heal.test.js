jest.mock('../models/Deployment', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../models/Company', () => ({ findById: jest.fn() }));
jest.mock('../models/CodeFile', () => ({ find: jest.fn() }));
jest.mock('../models/LocalProject', () => ({ findById: jest.fn() }));
jest.mock('../models/TeamProject', () => ({ findById: jest.fn() }));
jest.mock('../models/AgentExecution', () => ({
  create: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../utils/agentOrchestrator', () => ({
  executeAgenticLoop: jest.fn(),
}));
jest.mock('../utils/agentAutoDeploy', () => ({
  redeployDeployment: jest.fn(),
}));
jest.mock('../utils/personalWorkspace', () => ({
  ensurePersonalWorkspace: jest.fn(),
}));
jest.mock('../utils/notificationTriggers', () => ({
  notifyDeploymentEvent: jest.fn(),
}));

const Deployment = require('../models/Deployment');
const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const LocalProject = require('../models/LocalProject');
const TeamProject = require('../models/TeamProject');
const AgentExecution = require('../models/AgentExecution');
const agentOrchestrator = require('../utils/agentOrchestrator');
const { redeployDeployment } = require('../utils/agentAutoDeploy');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { notifyDeploymentEvent } = require('../utils/notificationTriggers');
const selfHeal = require('../utils/deploymentSelfHeal');

const leanQuery = (value) => ({
  select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
});
const filesQuery = (value) => {
  const lean = jest.fn().mockResolvedValue(value);
  return {
    select: jest.fn(() => ({
      limit: jest.fn(() => ({ lean })),
      lean,
    })),
  };
};

function deployment(overrides = {}) {
  return {
    _id: 'deployment-id',
    userId: 'user-id',
    subdomain: 'demo-app',
    projectKey: 'project-id',
    projectId: null,
    status: 'failed',
    fault: 'platform',
    failureStage: 'platform',
    errorMessage: 'container exited with code 1',
    buildLogs: 'npm ERR! missing module',
    runtimeLogs: '',
    selfHeal: { status: 'running', attempts: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  LocalProject.findById.mockReturnValue(leanQuery({ workspaceId: 'workspace-id' }));
  TeamProject.findById.mockReturnValue(leanQuery(null));
  Company.findById.mockReturnValue(leanQuery({ settings: { selfHeal: true } }));
  CodeFile.find.mockReturnValue(filesQuery([
    { _id: 'file-id', name: 'index.js', path: '/', language: 'javascript', content: 'require("missing-module")' },
  ]));
  AgentExecution.create.mockResolvedValue({ _id: 'execution-id' });
  AgentExecution.updateOne.mockResolvedValue({});
  Deployment.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Deployment.updateMany.mockResolvedValue({ modifiedCount: 0 });
  redeployDeployment.mockResolvedValue({ success: true });
  ensurePersonalWorkspace.mockResolvedValue({ _id: 'personal-workspace-id' });
  notifyDeploymentEvent.mockReturnValue(undefined);
});

describe('deployment self-heal worker', () => {
  test('schedule enqueues a failed deployment with a fresh attempt budget', async () => {
    const result = await selfHeal.schedule('deployment-id');

    expect(result).toEqual({ scheduled: true });
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'deployment-id',
        status: 'failed',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'selfHeal.status': 'pending',
          'selfHeal.attempts': 0,
        }),
      })
    );
  });

  test('retries platform faults directly without running the agent', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment());

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    expect(agentOrchestrator.executeAgenticLoop).not.toHaveBeenCalled();
    expect(redeployDeployment).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-id',
      workspaceId: 'workspace-id',
      preserveSelfHeal: true,
      scheduleOnFailure: false,
    }));
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      { _id: 'deployment-id', 'selfHeal.status': 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({ 'selfHeal.status': 'succeeded' }),
      })
    );
    expect(notifyDeploymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'deployment_healed',
    }));
  });

  test('runs the agent for user-code faults and redeploys after a file change', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: true,
      iterations: [{
        action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
        result: { success: true },
      }],
      summary: { finalThought: 'Fixed the missing import.' },
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    expect(agentOrchestrator.executeAgenticLoop).toHaveBeenCalledTimes(1);
    const context = agentOrchestrator.executeAgenticLoop.mock.calls[0][1];
    expect(context.allowedTools).toEqual(expect.arrayContaining(['read_file', 'update_file']));
    expect(context.allowedTools).not.toContain('delete_file');
    expect(context.autoApproveTools).toEqual(expect.arrayContaining(['create_file', 'update_file']));
    expect(redeployDeployment).toHaveBeenCalledWith(expect.objectContaining({
      preserveSelfHeal: true,
      scheduleOnFailure: false,
      fallbackFault: 'user',
    }));
    expect(AgentExecution.updateOne).toHaveBeenCalledWith(
      { _id: 'execution-id' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
      })
    );
    // The agent is fed the project file manifest, build logs and file bodies.
    const goal = agentOrchestrator.executeAgenticLoop.mock.calls[0][0];
    expect(goal).toContain('index.js');
    expect(goal).toContain('npm ERR! missing module');
    expect(goal).toContain('require("missing-module")');
  });

  test('heals a project that has no workspace by using the files own company', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    LocalProject.findById.mockReturnValue(leanQuery({}));
    TeamProject.findById.mockReturnValue(leanQuery(null));
    CodeFile.find.mockReturnValue(filesQuery([
      { _id: 'file-id', name: 'index.js', path: '/', language: 'javascript', company: 'file-workspace-id' },
    ]));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: true,
      iterations: [{
        action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
        result: { success: true },
      }],
      summary: { finalThought: 'Fixed it.' },
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    const context = agentOrchestrator.executeAgenticLoop.mock.calls[0][1];
    expect(context.workspaceId).toBe('file-workspace-id');
    expect(redeployDeployment).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'file-workspace-id',
    }));
  });

  test('falls back to the owner personal workspace when no workspace is set anywhere', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    LocalProject.findById.mockReturnValue(leanQuery({}));
    TeamProject.findById.mockReturnValue(leanQuery(null));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: true,
      iterations: [{
        action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
        result: { success: true },
      }],
      summary: { finalThought: 'Fixed it.' },
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    expect(ensurePersonalWorkspace).toHaveBeenCalledWith('user-id');
    const context = agentOrchestrator.executeAgenticLoop.mock.calls[0][1];
    expect(context.workspaceId).toBe('personal-workspace-id');
  });

  test('gives up when the agent completes without changing any files', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user' }));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: true,
      iterations: [],
      summary: { finalThought: 'I could not find a safe fix.' },
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ gaveUp: true });
    expect(redeployDeployment).not.toHaveBeenCalled();
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      { _id: 'deployment-id', 'selfHeal.status': 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({ 'selfHeal.status': 'gave_up' }),
      })
    );
    expect(notifyDeploymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'deployment_heal_failed',
    }));
  });

  test('backs off and retries when the redeploy still fails', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ selfHeal: { status: 'running', attempts: 1 } }));
    redeployDeployment.mockRejectedValue(new Error('build still broken'));

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ retry: true, attempts: 1 });
    expect(result.nextAttemptAt).toBeInstanceOf(Date);
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      { _id: 'deployment-id', 'selfHeal.status': 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'selfHeal.status': 'pending',
          'selfHeal.lastError': 'build still broken',
        }),
      })
    );
  });

  test('gives up after the final allowed attempt', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({
      selfHeal: { status: 'running', attempts: selfHeal._config.MAX_ATTEMPTS },
    }));
    redeployDeployment.mockRejectedValue(new Error('build still broken'));

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ gaveUp: true });
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      { _id: 'deployment-id', 'selfHeal.status': 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({ 'selfHeal.status': 'gave_up' }),
      })
    );
  });

  test('does nothing when the workspace opted out of self-heal', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment());
    Company.findById.mockReturnValue(leanQuery({ settings: { selfHeal: false } }));

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ gaveUp: true });
    expect(redeployDeployment).not.toHaveBeenCalled();
    expect(agentOrchestrator.executeAgenticLoop).not.toHaveBeenCalled();
  });

  test('runTick schedules recent untracked failures and processes due rows', async () => {
    Deployment.find.mockReturnValue({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ _id: 'deployment-id' }]) })),
      })),
    });
    Deployment.findOneAndUpdate.mockResolvedValue(deployment());

    const result = await selfHeal.runTick();

    expect(Deployment.updateMany).toHaveBeenCalledTimes(5);
    expect(Deployment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'selfHeal.status': 'pending',
        'selfHeal.lastError': expect.objectContaining({
          $regex: expect.stringContaining('tokens per minute'),
        }),
        'selfHeal.recoveredAt': null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'selfHeal.attempts': 0,
          'selfHeal.recoveredAt': expect.any(Date),
        }),
      })
    );
    expect(Deployment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'selfHeal.status': 'gave_up',
        'selfHeal.recoveredAt': null,
        $or: expect.arrayContaining([
          expect.objectContaining({
            'selfHeal.summary': expect.objectContaining({ $regex: 'no resolvable workspace' }),
          }),
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'selfHeal.status': 'pending',
          'selfHeal.attempts': 0,
        }),
      })
    );
    expect(result).toMatchObject({ processed: 1 });
  });

  test('feeds the actual failing lines even when they are not in the log tail', () => {
    const noisy = `${'noise line\n'.repeat(2000)}Module not found: Can't resolve './globals.css'\n${'more noise\n'.repeat(2000)}`;
    const goal = selfHeal.buildHealingGoal(
      deployment({ fault: 'user', failureStage: 'build', buildLogs: noisy }),
      'project-id',
      []
    );

    expect(goal).toContain("Module not found: Can't resolve './globals.css'");
    expect(goal).toContain('Create the missing file "./globals.css"');
  });

  test('keeps the repair prompt inside the provider token budget', () => {
    const hugeLogs = `Module not found: Can't resolve './missing.css'\n${'noise\n'.repeat(20000)}`;
    const hugeFiles = Array.from({ length: 300 }, (_, i) => ({
      _id: `file-${i}`,
      name: `file-${i}.js`,
      path: '/',
      language: 'javascript',
      content: 'x'.repeat(10000),
    }));

    const goal = selfHeal.buildHealingGoal(
      deployment({ fault: 'user', failureStage: 'build', buildLogs: hugeLogs }),
      'project-id',
      hugeFiles,
      hugeFiles.slice(0, 4)
    );

    expect(goal.length).toBeLessThanOrEqual(selfHeal._config.MAX_GOAL_CHARS);
    expect(goal).toContain("Module not found: Can't resolve './missing.css'");
    expect(goal).toContain('goalAchieved=true');
  });

  test('uses a compact prompt after a token-limit failure', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({
      fault: 'user',
      failureStage: 'build',
      selfHeal: {
        status: 'running',
        attempts: 2,
        lastError: 'Groq API error: Request too large ... tokens per minute (TPM): Limit 8000, Requested 8410',
      },
    }));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: true,
      iterations: [{
        action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
        result: { success: true },
      }],
      summary: { finalThought: 'Fixed it.' },
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    const goal = agentOrchestrator.executeAgenticLoop.mock.calls[0][0];
    expect(goal).not.toContain('Relevant file contents');
    expect(goal.length).toBeLessThanOrEqual(selfHeal._config.COMPACT_GOAL_CHARS);
    const context = agentOrchestrator.executeAgenticLoop.mock.calls[0][1];
    expect(context.requireMutation).toBe(true);
    expect(context.agentMaxTokens).toBe(selfHeal._config.AGENT_MAX_TOKENS);
  });
});
