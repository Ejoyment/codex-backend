const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    }
}));
jest.mock('../middleware/trial', () => ({
    enforceProjectLimit: (_req, _res, next) => next()
}));
jest.mock('../middleware/workspaceAccess', () => ({
    assertCompanyMembership: jest.fn().mockResolvedValue(true)
}));
jest.mock('../utils/specAccess', () => ({
    resolveAccessibleSpecs: jest.fn(),
    getAccessibleProjects: jest.fn(),
    userCanAccessProject: jest.fn()
}));
jest.mock('../utils/personalWorkspace', () => ({
    ensurePersonalWorkspace: jest.fn()
}));
jest.mock('../utils/githubApiClient', () => ({
    getGitHubIntegration: jest.fn()
}));
jest.mock('../utils/projectProvisioningService', () => ({
    TEMPLATE_FILES: {
        'Full-stack web application': () => []
    },
    provisionProject: jest.fn(),
    retryProvisioning: jest.fn(),
    normalizeRepoName: jest.fn(),
    normalizeBranch: jest.fn()
}));
jest.mock('../models/LocalProject');
jest.mock('../models/LocalTask');
jest.mock('../models/CodeFile');

const LocalProject = require('../models/LocalProject');
const { userCanAccessProject } = require('../utils/specAccess');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { getGitHubIntegration } = require('../utils/githubApiClient');
const {
    provisionProject,
    retryProvisioning,
    normalizeRepoName,
    normalizeBranch
} = require('../utils/projectProvisioningService');
const projectsRouter = require('../routes/projects');

const app = express();
app.use(express.json());
app.use('/api/projects', projectsRouter);

function projectRecord(overrides = {}) {
    return {
        _id: '507f1f77bcf86cd799439021',
        userId: '507f1f77bcf86cd799439011',
        name: 'Test project',
        description: '',
        status: 'active',
        sourceType: 'scratch',
        provisioningStatus: 'pending',
        provisioningError: '',
        provisionedFileCount: 0,
        defaultBranch: 'main',
        technologies: [],
        ...overrides
    };
}

describe('project provisioning routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ensurePersonalWorkspace.mockResolvedValue({ _id: '507f1f77bcf86cd799439012' });
        userCanAccessProject.mockResolvedValue(true);
        normalizeRepoName.mockImplementation((value) => ({
            fullName: value,
            url: `https://github.com/${value}`
        }));
        normalizeBranch.mockImplementation((value) => value || 'main');
        LocalProject.create.mockImplementation(async (data) => projectRecord(data));
        provisionProject.mockImplementation(async (projectId) => projectRecord({
            _id: projectId,
            provisioningStatus: 'ready',
            provisionedFileCount: 3
        }));
    });

    test('creates a scratch project and returns provisioned files', async () => {
        const response = await request(app)
            .post('/api/projects')
            .send({
                name: 'Scratch project',
                sourceType: 'scratch',
                defaultBranch: 'main',
                intelligence: {}
            });

        expect(response.status).toBe(201);
        expect(LocalProject.create).toHaveBeenCalledWith(expect.objectContaining({
            provisioningStatus: 'pending'
        }));
        expect(provisionProject).toHaveBeenCalled();
        expect(response.body.project.provisioningStatus).toBe('ready');
    });

    test('starts a GitHub import without waiting for provisioning', async () => {
        getGitHubIntegration.mockResolvedValue({ accessToken: 'token' });

        const response = await request(app)
            .post('/api/projects')
            .send({
                name: 'Imported project',
                sourceType: 'github',
                githubRepoName: 'acme/widgets',
                defaultBranch: 'main',
                intelligence: {}
            });

        expect(response.status).toBe(201);
        expect(getGitHubIntegration).toHaveBeenCalled();
        expect(provisionProject).toHaveBeenCalled();
        expect(response.body.project.provisioningStatus).toBe('pending');
    });

    test('rejects GitHub import without a connected account', async () => {
        getGitHubIntegration.mockRejectedValue(Object.assign(
            new Error('GitHub not connected'),
            { code: 'GITHUB_NOT_CONNECTED' }
        ));

        const response = await request(app)
            .post('/api/projects')
            .send({
                name: 'Imported project',
                sourceType: 'github',
                githubRepoName: 'acme/widgets',
                intelligence: {}
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Connect GitHub');
        expect(LocalProject.create).not.toHaveBeenCalled();
    });

    test('rejects an unsupported template', async () => {
        const response = await request(app)
            .post('/api/projects')
            .send({
                name: 'Template project',
                sourceType: 'template',
                template: 'Unsupported template',
                intelligence: {}
            });

        expect(response.status).toBe(400);
        expect(LocalProject.create).not.toHaveBeenCalled();
    });

    test('returns provisioning status for an accessible project', async () => {
        LocalProject.findById.mockResolvedValue(projectRecord({
            provisioningStatus: 'provisioning',
            provisionedFileCount: 2
        }));

        const response = await request(app)
            .get('/api/projects/507f1f77bcf86cd799439021/provisioning');

        expect(response.status).toBe(200);
        expect(response.body.project.provisioningStatus).toBe('provisioning');
        expect(response.body.project.provisionedFileCount).toBe(2);
    });

    test('hides provisioning status for inaccessible projects', async () => {
        LocalProject.findById.mockResolvedValue(projectRecord());
        userCanAccessProject.mockResolvedValue(false);

        const response = await request(app)
            .get('/api/projects/507f1f77bcf86cd799439021/provisioning');

        expect(response.status).toBe(404);
    });

    test('retries a failed scratch project', async () => {
        LocalProject.findById.mockResolvedValue(projectRecord({ provisioningStatus: 'failed' }));
        retryProvisioning.mockResolvedValue(projectRecord({
            provisioningStatus: 'ready',
            provisionedFileCount: 3
        }));

        const response = await request(app)
            .post('/api/projects/507f1f77bcf86cd799439021/provisioning/retry');

        expect(response.status).toBe(200);
        expect(retryProvisioning).toHaveBeenCalled();
        expect(response.body.project.provisioningStatus).toBe('ready');
    });

    test('does not retry a ready project', async () => {
        LocalProject.findById.mockResolvedValue(projectRecord({ provisioningStatus: 'ready' }));

        const response = await request(app)
            .post('/api/projects/507f1f77bcf86cd799439021/provisioning/retry');

        expect(response.status).toBe(200);
        expect(retryProvisioning).not.toHaveBeenCalled();
    });

    test('rejects a retry while provisioning is running', async () => {
        LocalProject.findById.mockResolvedValue(projectRecord({ provisioningStatus: 'provisioning' }));

        const response = await request(app)
            .post('/api/projects/507f1f77bcf86cd799439021/provisioning/retry');

        expect(response.status).toBe(409);
        expect(retryProvisioning).not.toHaveBeenCalled();
    });
});
