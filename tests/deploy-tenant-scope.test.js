/**
 * Deployment file selection is tenant-scoped: a caller cannot point
 * companyId (or a project's stored workspaceId) at another workspace and
 * publish its CodeFile rows.
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
    findPersonalWorkspaceById: jest.fn(),
    ensurePersonalWorkspace: jest.fn(),
}));
jest.mock('../utils/deploymentService', () => ({
    buildFileRelPath: (file) => file.name,
    assertSafeRelPath: () => {},
}));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.mock('../utils/notificationTriggers', () => ({ notifyDeploymentEvent: jest.fn() }));

const Company = require('../models/Company');
const Deployment = require('../models/Deployment');
const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const { findPersonalWorkspace, findPersonalWorkspaceById, ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const deploymentsRouter = require('../routes/deployments');
const { backfillFileContent } = require('../utils/deployContent');

const USER_ID = '507f1f77bcf86cd799439011';
const PERSONAL_ID = '507f1f77bcf86cd799439099';

const companyQuery = (result) => ({
    select: () => ({ lean: async () => result }),
});

describe('deployment tenant scoping', () => {
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
        findPersonalWorkspaceById.mockResolvedValue(null);
        ensurePersonalWorkspace.mockResolvedValue({ _id: PERSONAL_ID, userId: USER_ID, type: 'personal' });
        CodeFile.find.mockReturnValue({ lean: async () => [] });
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    test('rejects a foreign companyId before reading files', async () => {
        const response = await request(app)
            .post('/api/deployments')
            .send({
                subdomain: 'victim-app',
                companyId: '507f1f77bcf86cd799439012',
                files: [{ name: 'index.html', path: '/', content: '<h1>x</h1>' }],
            });

        expect(response.status).toBe(403);
        expect(CodeFile.find).not.toHaveBeenCalled();
    });

    test('never reads files from a project workspace that belongs to another tenant', async () => {
        const foreignWorkspaceId = '507f1f77bcf86cd799439012';
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({
                _id: '507f1f77bcf86cd799439013',
                workspaceId: foreignWorkspaceId,
            }),
        });

        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'victim-app', projectId: '507f1f77bcf86cd799439013' });

        // The project belongs to the caller, so a stale/foreign workspace id
        // falls back to their personal scope instead of locking them out.
        expect(response.status).toBe(400);
        expect(CodeFile.find).toHaveBeenCalledWith({
            project: '507f1f77bcf86cd799439013',
        });
        expect(CodeFile.find).not.toHaveBeenCalledWith(expect.objectContaining({
            company: foreignWorkspaceId,
        }));
    });

    test('allows a workspace the caller belongs to', async () => {
        const workspaceId = '507f1f77bcf86cd799439014';
        Company.findById.mockReturnValue(companyQuery({
            _id: workspaceId,
            owner: USER_ID,
            members: [],
            isActive: true,
        }));
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({
                _id: '507f1f77bcf86cd799439013',
                workspaceId,
            }),
        });

        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', projectId: '507f1f77bcf86cd799439013' });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/no .*files/i);
    });

    test('an empty selected project never falls back to workspace files', async () => {
        const workspaceId = '507f1f77bcf86cd799439014';
        const projectId = '507f1f77bcf86cd799439013';
        Company.findById.mockReturnValue(companyQuery({
            _id: workspaceId,
            owner: USER_ID,
            members: [],
            isActive: true,
        }));
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({ _id: projectId, workspaceId }),
        });

        CodeFile.find.mockReturnValue({ lean: async () => [] });

        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', projectId });

        expect(response.status).toBe(400);
        expect(CodeFile.find).toHaveBeenCalledTimes(1);
        expect(CodeFile.find).toHaveBeenCalledWith({ project: projectId });
    });

    test('accepts the caller personal workspace id as companyId', async () => {
        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', companyId: PERSONAL_ID });

        // Access must not be denied for the caller's own personal workspace.
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/No files available/i);
    });

    test('deploys a personal project whose stored workspace is the personal subscription id', async () => {
        const projectId = '507f1f77bcf86cd799439013';
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({ _id: projectId, workspaceId: PERSONAL_ID }),
        });

        // This is exactly the editor payload: companyId mirrors the project's
        // personal workspace id.
        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', projectId, companyId: PERSONAL_ID });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/no deployable files/i);
        expect(CodeFile.find).toHaveBeenCalledWith({ project: projectId });
    });

    test('falls back to the personal workspace for a stale project workspace id', async () => {
        const projectId = '507f1f77bcf86cd799439013';
        const staleWorkspaceId = '507f1f77bcf86cd7994390aa';
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({
                _id: projectId,
                workspaceId: staleWorkspaceId,
            }),
        });

        // The editor mirrors the project's workspace into companyId.
        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'my-app', projectId, companyId: staleWorkspaceId });

        expect(response.status).toBe(400);
        expect(CodeFile.find).toHaveBeenCalledWith({ project: projectId });
    });

    test('rejects a deployment run that loses the atomic claim', async () => {
        Deployment.findOne.mockResolvedValue({
            _id: '507f1f77bcf86cd799439015',
            userId: { toString: () => '507f1f77bcf86cd799439011' },
            status: 'success',
            buildRunId: null,
        });
        Deployment.findOneAndUpdate.mockResolvedValue(null);

        const response = await request(app)
            .post('/api/deployments')
            .send({
                subdomain: 'my-app',
                files: [{ name: 'index.html', path: '/', content: '<h1>x</h1>' }],
            });

        expect(response.status).toBe(409);
        expect(Deployment.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: { $nin: ['building', 'deploying'] },
                buildRunId: { $in: [null] },
            }),
            expect.objectContaining({
                $set: expect.objectContaining({ status: 'building', buildRunId: expect.any(String) }),
            }),
            { new: true }
        );
    });

    test('content backfill reads only the selected project', async () => {
        const workspaceId = '507f1f77bcf86cd799439014';
        const projectId = '507f1f77bcf86cd799439013';
        CodeFile.find.mockReturnValue({ lean: async () => [] });

        await expect(backfillFileContent({
            userId: '507f1f77bcf86cd799439011',
            projectId,
            workspaceId,
            files: [{ name: 'app.js', path: '/', language: 'javascript' }],
        })).rejects.toThrow(/No file content/);

        expect(CodeFile.find).toHaveBeenCalledWith({ project: projectId });
        expect(CodeFile.find).not.toHaveBeenCalledWith(expect.objectContaining({
            $or: expect.anything(),
        }));
    });
});
