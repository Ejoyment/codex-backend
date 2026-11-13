jest.mock('../models/Company', () => ({ findById: jest.fn() }));
jest.mock('../models/CodeFile', () => ({ find: jest.fn() }));
jest.mock('../models/Deployment', () => ({ findOne: jest.fn() }));
jest.mock('../models/LocalProject', () => ({ findById: jest.fn() }));
jest.mock('../models/TeamProject', () => ({ findById: jest.fn() }));
jest.mock('../utils/deploymentService', () => ({
  detectRuntime: jest.fn(() => ({ runtime: 'node' })),
  deployProject: jest.fn(),
  capLogTail: jest.fn((value) => value),
}));
jest.mock('../utils/deployContent', () => ({
  validateDeployFiles: jest.fn(),
  backfillFileContent: jest.fn(),
  repoRefFromProject: jest.fn(() => null),
  limits: jest.fn(() => ({ backfillTimeoutMs: 1000 })),
}));
jest.mock('../utils/notificationTriggers', () => ({ notifyDeploymentEvent: jest.fn() }));

const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const Deployment = require('../models/Deployment');
const LocalProject = require('../models/LocalProject');
const TeamProject = require('../models/TeamProject');
const deploymentService = require('../utils/deploymentService');
const { backfillFileContent, validateDeployFiles } = require('../utils/deployContent');
const { notifyDeploymentEvent } = require('../utils/notificationTriggers');
const { redeployApprovedProject, redeployDeployment } = require('../utils/agentAutoDeploy');

const query = (value) => ({
  select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
});

function activeDeployment() {
  return {
    _id: 'deployment-id',
    subdomain: 'demo-app',
    containerId: 'container-id',
    status: 'success',
    save: jest.fn(async function () { return this; }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  LocalProject.findById.mockReturnValue(query({ workspaceId: 'workspace-id' }));
  TeamProject.findById.mockReturnValue(query(null));
  Company.findById.mockReturnValue(query({ settings: { autoDeploy: true } }));
  CodeFile.find.mockReturnValue(query([{ name: 'index.js', path: '/', content: 'console.log("ok")' }]));
  Deployment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
  deploymentService.deployProject.mockResolvedValue({
    containerId: 'new-container-id',
    url: 'https://demo-app.buildrshq.dev',
    runtimeLogs: 'started',
  });
});

describe('redeployApprovedProject', () => {
  const execution = { projectId: 'project-id' };

  test('skips deployment when workspace auto-deploy is disabled', async () => {
    Company.findById.mockReturnValue(query({ settings: { autoDeploy: false } }));

    await expect(redeployApprovedProject({ execution, userId: 'user-id' }))
      .resolves.toMatchObject({ skipped: true });

    expect(Deployment.findOne).not.toHaveBeenCalled();
    expect(deploymentService.deployProject).not.toHaveBeenCalled();
  });

  test('skips when the project has no active deployment', async () => {
    await expect(redeployApprovedProject({ execution, userId: 'user-id' }))
      .resolves.toMatchObject({ skipped: true });

    expect(deploymentService.deployProject).not.toHaveBeenCalled();
  });

  test('redeploys an active project using its approved files', async () => {
    const deployment = activeDeployment();
    Deployment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(deployment) });

    const result = await redeployApprovedProject({
      execution,
      userId: 'user-id',
      workspaceId: 'workspace-id',
    });

    expect(result).toMatchObject({ success: true });
    expect(validateDeployFiles).toHaveBeenCalledTimes(2);
    expect(backfillFileContent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-id',
      workspaceId: 'workspace-id',
      source: 'project',
    }));
    expect(deploymentService.deployProject).toHaveBeenCalledWith(
      'demo-app',
      [{ name: 'index.js', path: '/', content: 'console.log("ok")', language: 'plaintext' }],
      expect.objectContaining({ onLog: expect.any(Function), onStep: expect.any(Function) })
    );
    expect(deployment).toMatchObject({
      status: 'success',
      containerId: 'new-container-id',
      deployedUrl: 'https://demo-app.buildrshq.dev',
      runtime: 'node',
    });
    expect(notifyDeploymentEvent).toHaveBeenCalledTimes(2);
  });

  test('injects the deployment env vars into the container run', async () => {
    const deployment = activeDeployment();
    deployment.env = [
      { key: 'PORT', value: '8080', secret: false, encrypted: false },
      { key: 'API_KEY', value: 'plain-secret', secret: true, encrypted: false },
    ];
    Deployment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(deployment) });

    await redeployApprovedProject({ execution, userId: 'user-id', workspaceId: 'workspace-id' });

    expect(deploymentService.deployProject).toHaveBeenCalledWith(
      'demo-app',
      expect.any(Array),
      expect.objectContaining({ env: { PORT: '8080', API_KEY: 'plain-secret' } })
    );
  });

  test('persists the crash runtime logs when a redeploy fails', async () => {
    const deployment = activeDeployment();
    deployment.projectKey = 'project-id';
    const failure = Object.assign(new Error('app crashed'), {
      fault: 'user',
      stage: 'start',
      runtimeLogs: 'Error: Cannot find module express',
    });
    deploymentService.deployProject.mockRejectedValue(failure);

    await expect(redeployDeployment({
      deployment,
      userId: 'user-id',
      projectId: 'project-id',
      scheduleOnFailure: false,
    })).rejects.toThrow('app crashed');

    expect(deployment).toMatchObject({
      status: 'failed',
      fault: 'user',
      failureStage: 'start',
      runtimeLogs: 'Error: Cannot find module express',
    });
  });
});
