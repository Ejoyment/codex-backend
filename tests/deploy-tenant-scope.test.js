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
jest.mock('../utils/deploymentService', () => ({}));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.mock('../utils/notificationTriggers', () => ({ notifyDeploymentEvent: jest.fn() }));

const Company = require('../models/Company');
const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const deploymentsRouter = require('../routes/deployments');

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

    test('rejects a project whose stored workspace belongs to another tenant', async () => {
        LocalProject.findOne.mockReturnValue({
            lean: async () => ({
                _id: '507f1f77bcf86cd799439013',
                workspaceId: '507f1f77bcf86cd799439012',
            }),
        });

        const response = await request(app)
            .post('/api/deployments')
            .send({ subdomain: 'victim-app', projectId: '507f1f77bcf86cd799439013' });

        expect(response.status).toBe(403);
        expect(CodeFile.find).not.toHaveBeenCalled();
    });

    test('allows a workspace the caller belongs to', async () => {
        const workspaceId = '507f1f77bcf86cd799439014';
        Company.findOne.mockReturnValue(companyQuery({ _id: workspaceId }));
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
});
