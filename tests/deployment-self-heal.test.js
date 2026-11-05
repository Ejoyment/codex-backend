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

  test('extracts errors from non-Node toolchains', () => {
    const cases = [
      {
        name: 'python',
        log: 'Collecting flask\nTraceback (most recent call last):\n  File "/app/main.py", line 3, in <module>\n    import flask\nModuleNotFoundError: No module named \'flask\'',
        expected: 'ModuleNotFoundError',
      },
      {
        name: 'go',
        log: '# example.com/app\n./main.go:12:2: undefined: handler\n',
        expected: './main.go:12:2: undefined: handler',
      },
      {
        name: 'rust',
        log: 'error[E0432]: unresolved import `serde`\n --> src/main.rs:2:5\n',
        expected: 'error[E0432]: unresolved import `serde`',
      },
      {
        name: 'java',
        log: 'Main.java:4: error: cannot find symbol\n  symbol: class Gson\n',
        expected: 'cannot find symbol',
      },
      {
        name: 'dotnet',
        log: 'Program.cs(7,9): error CS0103: The name `Console` does not exist\n',
        expected: 'error CS0103',
      },
      {
        name: 'docker',
        log: '#8 1.203 failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1',
        expected: 'failed to solve',
      },
    ];

    for (const item of cases) {
      const digest = selfHeal.buildErrorDigest({
        fault: 'user',
        failureStage: 'build',
        buildLogs: `${'noise\n'.repeat(500)}${item.log}${'noise\n'.repeat(500)}`,
      });
      expect(digest).toContain(item.expected);
    }
  });

  test('suggests the right manifest for non-Node failures', () => {
    const pythonFiles = [{ _id: 'f1', name: 'requirements.txt', path: '/', language: 'text' }];
    const pythonHints = selfHeal.buildRepairHints(
      "ModuleNotFoundError: No module named 'flask'",
      pythonFiles
    );
    expect(pythonHints.join('\n')).toContain('requirements.txt');

    const goFiles = [{ _id: 'f2', name: 'go.mod', path: '/', language: 'go' }];
    const goHints = selfHeal.buildRepairHints(
      './main.go:12:2: undefined: handler',
      goFiles
    );
    expect(goHints.join('\n')).toMatch(/Go compile error/i);

    const rustFiles = [{ _id: 'f3', name: 'Cargo.toml', path: '/', language: 'toml' }];
    const rustHints = selfHeal.buildRepairHints(
      'error[E0432]: unresolved import `serde`',
      rustFiles
    );
    expect(rustHints.join('\n')).toContain('Cargo.toml');

    const javaFiles = [{ _id: 'f4', name: 'pom.xml', path: '/', language: 'xml' }];
    const javaHints = selfHeal.buildRepairHints(
      'Main.java:4: error: cannot find symbol',
      javaFiles
    );
    expect(javaHints.join('\n')).toContain('pom.xml');
  });

  test('detects manifests and tells the agent the stack is not assumed', () => {
    const goal = selfHeal.buildHealingGoal(
      deployment({ fault: 'user', failureStage: 'build', buildLogs: 'error CS0103: missing' }),
      'project-id',
      [
        { _id: 'f1', name: 'Program.cs', path: '/', language: 'csharp' },
        { _id: 'f2', name: 'app.csproj', path: '/', language: 'xml' },
        { _id: 'f3', name: 'Dockerfile', path: '/', language: 'dockerfile' },
      ]
    );

    expect(goal).toContain('may use any language, framework, or build system');
    expect(goal).toContain('dockerfile');
    expect(goal).toContain('edit_file');
    expect(goal).toContain('Detected runtime: docker');
    expect(goal).toContain('create a correct Dockerfile');
  });

  test('tells the agent when an unsupported stack was detected as static', () => {
    const goal = selfHeal.buildHealingGoal(
      deployment({ fault: 'user', failureStage: 'build', buildLogs: 'Main.java:4: error: cannot find symbol' }),
      'project-id',
      [
        { _id: 'f1', name: 'Main.java', path: '/src', language: 'java', content: 'class Main {}' },
        { _id: 'f2', name: 'pom.xml', path: '/', language: 'xml', content: '<project/>' },
      ]
    );

    expect(goal).toContain('Detected runtime: static');
    expect(goal).toContain('create a correct Dockerfile');
    expect(goal).toContain('pom.xml');
  });

  test('resolves a missing relative import against the file that imports it', () => {
    const hints = selfHeal.buildRepairHints(
      "./app/layout.tsx\nModule not found: Can't resolve './globals.css'",
      [{ _id: 'layout-id', name: 'layout.tsx', path: '/app', language: 'tsx' }]
    );

    expect(hints.join('\n')).toContain('Create the missing file "app/globals.css"');
    expect(hints.join('\n')).toContain('imported as "./globals.css" by app/layout.tsx');
  });

  test('prefers the persisted deployment runtime over metadata-only detection', () => {
    const goal = selfHeal.buildHealingGoal(
      deployment({
        fault: 'user',
        failureStage: 'build',
        buildLogs: "Module not found: Can't resolve './globals.css'",
      }),
      'project-id',
      [{ _id: 'f1', name: 'package.json', path: '/', language: 'json' }],
      [],
      { runtime: 'node' }
    );

    expect(goal).toContain('Detected runtime: node');
    expect(goal).not.toContain('Detected runtime: static');
  });

  test('drops the context listing and keeps compiler lines intact', () => {
    const logs = [
      'Context contents: total 64',
      'drwxr-xr-x 9 deployer deployer 4096 Nov  4 15:48 .',
      '-rw-r--r-- 1 deployer deployer 945 Nov  4 15:48 package.json',
      './app/layout.tsx',
      "Module not found: Can't resolve './globals.css'",
      './app/page.tsx',
      "Error: You're importing a component that needs useState. It only works in a Client Component but none of its parents are marked with \"use client\"",
    ].join('\n');

    const digest = selfHeal.buildErrorDigest(deployment({ errorMessage: '', buildLogs: logs }));

    expect(digest).not.toContain('Context contents');
    expect(digest).not.toMatch(/^drwxr-xr-x/m);
    expect(digest).not.toMatch(/^-rw-r--r--/m);
    expect(digest).toContain("Can't resolve './globals.css'");
    expect(digest).toContain('It only works in a Client Component');

    const goal = selfHeal.buildHealingGoal(
      deployment({
        errorMessage: 'Your build failed (node, context \'.\'). Context contents: total 64\ndrwxr-xr-x 9 deployer deployer 4096 Nov  4 15:48 .',
        buildLogs: logs,
      }),
      'project-id',
      []
    );
    expect(goal).not.toContain('Context contents');
    expect(goal).not.toMatch(/drwxr-xr-x/);
  });

  test('points the agent at the files named in the log', () => {
    const goal = selfHeal.buildHealingGoal(
      deployment({
        fault: 'user',
        failureStage: 'build',
        errorMessage: '',
        buildLogs: [
          './app/layout.tsx',
          "Module not found: Can't resolve './globals.css'",
          './app/page.tsx',
          'Error: hooks require a client component',
        ].join('\n'),
      }),
      'project-id',
      [
        { _id: 'layout-id', name: 'layout.tsx', path: '/app', language: 'tsx' },
        { _id: 'page-id', name: 'page.tsx', path: '/app', language: 'tsx' },
        { _id: 'css-id', name: 'globals.css', path: '/app', language: 'css' },
      ]
    );

    expect(goal).toContain('Files named in the log');
    expect(goal).toContain('app/layout.tsx (id: layout-id)');
    expect(goal).toContain('app/page.tsx (id: page-id)');
    expect(goal).toContain('app/globals.css (id: css-id)');
  });

  test('retries inline with the compact prompt when the provider rejects the request size', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    agentOrchestrator.executeAgenticLoop
      .mockResolvedValueOnce({
        success: false,
        iterations: [],
        error: 'Request too large: tokens per minute (TPM) limit 8000',
      })
      .mockResolvedValueOnce({
        success: true,
        iterations: [{
          action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
          result: { success: true },
        }],
        summary: { finalThought: 'Fixed it.' },
      });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ healed: true });
    expect(agentOrchestrator.executeAgenticLoop).toHaveBeenCalledTimes(2);
    const secondGoal = agentOrchestrator.executeAgenticLoop.mock.calls[1][0];
    expect(secondGoal.length).toBeLessThanOrEqual(selfHeal._config.COMPACT_GOAL_CHARS);
  });

  test('persists agent progress to the deployment and the execution log', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    agentOrchestrator.executeAgenticLoop.mockImplementation(async (goal, context) => {
      context.onProgress({ type: 'thinking', iteration: 1 });
      context.onProgress({
        type: 'iteration',
        iteration: 1,
        message: 'Reading a source file',
        action: { tool: 'read_file' },
      });
      return {
        success: true,
        iterations: [{
          action: { tool: 'update_file', parameters: { fileId: 'file-id' } },
          result: { success: true },
        }],
        summary: { finalThought: 'Fixed it.' },
      };
    });

    await selfHeal.processDeployment('deployment-id');

    const progressWrites = Deployment.updateOne.mock.calls
      .map(([, update]) => update?.$set?.['selfHeal.progress'])
      .filter(Boolean);
    expect(progressWrites.length).toBeGreaterThan(0);
    expect(progressWrites.some((line) => /Reading a source file/.test(line))).toBe(true);

    const logWrites = AgentExecution.updateOne.mock.calls
      .filter(([, update]) => update?.$push?.logs);
    expect(logWrites.length).toBeGreaterThan(0);
  });

  test('runs the worker immediately after scheduling instead of waiting for the poll', async () => {
    await selfHeal.schedule('deployment-id');
    await new Promise((resolve) => setImmediate(resolve));

    expect(Deployment.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'deployment-id' }),
      expect.anything(),
      expect.anything()
    );
  });

  test('reports the real agent error when an attempt fails', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: false,
      iterations: [],
      error: 'Agent reasoning failed: Unexpected token < in JSON',
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ retry: true });
    expect(Deployment.updateOne).toHaveBeenCalledWith(
      { _id: 'deployment-id', 'selfHeal.status': 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'selfHeal.lastError': 'Agent reasoning failed: Unexpected token < in JSON',
          'selfHeal.summary': expect.stringContaining('Agent reasoning failed: Unexpected token < in JSON'),
        }),
      })
    );
  });

  test('gives up with an actionable message when the AI provider rejects the key', async () => {
    Deployment.findOneAndUpdate.mockResolvedValue(deployment({ fault: 'user', failureStage: 'build' }));
    agentOrchestrator.executeAgenticLoop.mockResolvedValue({
      success: false,
      iterations: [],
      error: 'Groq API error: Invalid API Key',
    });

    const result = await selfHeal.processDeployment('deployment-id');

    expect(result).toMatchObject({ gaveUp: true });
    expect(result.summary).toContain('Check the provider API key');
    expect(redeployDeployment).not.toHaveBeenCalled();
    expect(notifyDeploymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'deployment_heal_failed',
    }));
  });
});
