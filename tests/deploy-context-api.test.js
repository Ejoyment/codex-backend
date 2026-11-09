/**
 * POST /api/deployments persists the Deployment page context
 * (branch / environment / commit / build settings) and preserves it on
 * redeploy when the client omits it.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    },
}));

jest.mock('../middleware/tierEnforcement', () => ({
    enforceDeploymentLimit: () => (_req, _res, next) => next(),
}));

jest.mock('../models/Deployment');
jest.mock('../models/LocalProject');
jest.mock('../models/TeamProject');
jest.mock('../models/CodeFile');
jest.mock('../models/Company');
jest.mock('../utils/personalWorkspace', () => ({
    findPersonalWorkspace: jest.fn(),
    ensurePersonalWorkspace: jest.fn(),
}));
jest.mock('../utils/deploymentService', () => ({
    buildFileRelPath: (file) => file.name,
    assertSafeRelPath: () => {},
    deployProject: jest.fn(),
    detectRuntime: jest.fn(),
    capLogTail: jest.fn((value) => value),
    stopDeployment: jest.fn(),
}));
jest.mock('../utils/deployContent', () => ({
    ...jest.requireActual('../utils/deployContent'),
    backfillFileContent: jest.fn(),
}));
jest.mock('../utils/agentAutoDeploy', () => ({
    redeployDeployment: jest.fn(),
    resetSelfHealState: jest.fn(),
}));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.mock('../utils/notificationTriggers', () => ({ notifyDeploymentEvent: jest.fn() }));

const Deployment = require('../models/Deployment');
const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const depService = require('../utils/deploymentService');
const { findPersonalWorkspace, ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const deploymentsRouter = require('../routes/deployments');

const USER_ID = '507f1f77bcf86cd799439011';
const PERSONAL_ID = '507f1f77bcf86cd799439099';

const companyQuery = (result) => ({
    select: () => ({ lean: async () => result }),
});

function docFrom(payload) {
    const doc = { _id: '507f1f77bcf86cd799439015', status: 'building', ...payload };
    doc.toObject = () => ({ ...doc, toObject: undefined });
    return doc;
}

describe('deployment context persistence', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/deployments', deploymentsRouter);

    const savedEnv = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.DEPLOY_SSH_HOST = 'deploy.example.com';
        process.env.DEPLOY_SSH_KEY = 'key';
        Company.findOne.mockReturnValue(companyQuery(null));
        Company.findById.mockReturnValue(companyQuery(null));
        findPersonalWorkspace.mockResolvedValue({ _id: PERSONAL_ID, userId: USER_ID, type: 'personal' });
        ensurePersonalWorkspace.mockResolvedValue({ _id: PERSONAL_ID, userId: USER_ID, type: 'personal' });
        CodeFile.find.mockReturnValue({ lean: async () => [] });
        depService.deployProject.mockResolvedValue({ containerId: 'c1', url: 'https://my-app.buildrshq.dev', runtimeLogs: '' });
        depService.detectRuntime.mockReturnValue({ runtime: 'static', contextDir: './' });
        Deployment.findOne.mockResolvedValue(null);
        Deployment.exists.mockResolvedValue(true);
        Deployment.create.mockImplementation(async (payload) => docFrom(payload));
        Deployment.findOneAndUpdate.mockImplementation(async (_filter, update) => docFrom(update?.$set || {}));
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    const files = [{ name: 'index.html', path: '/', content: '<h1>x</h1>' }];

    test('stores branch, environment, commit and build settings on create', async () => {
        const response = await request(app)
            .post('/api/deployments')
            .send({
                subdomain: 'my-app',
                files,
                branch: 'feature/auth-flow',
                environment: 'Preview',
                commit: '8ea2f1c',
                framework: 'Vite',
                buildCommand: 'pnpm build',
                rootDirectory: './',
                outputDirectory: 'dist',
            });

        expect(response.status).toBe(201);
        expect(Deployment.create).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'feature/auth-flow',
            environment: 'Preview',
            commit: '8ea2f1c',
            framework: 'Vite',
            buildCommand: 'pnpm build',
            rootDirectory: './',
            outputDirectory: 'dist',
            region: null,
            subdomain: 'my-app',
        }));
        expect(response.body.deployment.branch).toBe('feature/auth-flow');
        expect(response.body.deployment.environment).toBe('Preview');
        expect(response.body.deployment.commit).toBe('8ea2f1c');
    });

    test('defaults new deployments to main / Production and derives branch from the repo', async () => {
        const response = await request(app)
            .post('/api/deployments')
            .send({
                subdomain: 'my-app',
                files,
                repo: { owner: 'octo', name: 'app', defaultBranch: 'develop' },
            });

        expect(response.status).toBe(201);
        expect(Deployment.create).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'develop',
            environment: 'Production',
            commit: null,
        }));
    });

    test('rejects invalid context with 400 and never creates a deployment', async () => {
        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', files, branch: 'not a branch', environment: 'qa' });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Invalid branch/);
        expect(Deployment.create).not.toHaveBeenCalled();
        expect(Deployment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('preserves existing branch/environment/commit on redeploy when omitted', async () => {
        Deployment.findOne.mockResolvedValue({
            _id: '507f1f77bcf86cd799439015',
            userId: USER_ID,
            status: 'success',
            buildRunId: null,
            branch: 'release/1',
            environment: 'Preview',
            commit: 'abcdef1234567890',
        });

        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', files });

        expect(response.status).toBe(201);
        expect(Deployment.findOneAndUpdate).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                $set: expect.objectContaining({
                    branch: 'release/1',
                    environment: 'Preview',
                    commit: 'abcdef1234567890',
                }),
            }),
            { new: true }
        );
        expect(Deployment.create).not.toHaveBeenCalled();
    });
});
