/**
 * Attaching a project to a workspace is a tenant boundary: a foreign
 * workspaceId would let the deploy route read that workspace's files.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    },
}));

jest.mock('../models/LocalProject');
jest.mock('../models/LocalTask');
jest.mock('../models/CodeFile');
jest.mock('../models/Company');
jest.mock('../utils/personalWorkspace', () => ({
    findPersonalWorkspace: jest.fn(),
    findPersonalWorkspaceById: jest.fn(),
    ensurePersonalWorkspace: jest.fn(),
}));

const Company = require('../models/Company');
const LocalProject = require('../models/LocalProject');
const { findPersonalWorkspace, findPersonalWorkspaceById, ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const projectsRouter = require('../routes/projects');

const companyQuery = (result) => ({
    select: () => ({ lean: async () => result }),
});

describe('project workspace scoping', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);

    beforeEach(() => {
        jest.clearAllMocks();
        // workspaceAccess.userIsCompanyMember resolves membership through the
        // canonical workspace identity (company by id).
        Company.findOne.mockReturnValue(companyQuery(null));
        Company.findById.mockReturnValue(companyQuery(null));
        findPersonalWorkspace.mockResolvedValue(null);
        findPersonalWorkspaceById.mockResolvedValue(null);
        ensurePersonalWorkspace.mockResolvedValue(null);
        LocalProject.findOne.mockReturnValue({
            _id: '507f1f77bcf86cd799439013',
            workspaceId: null,
            save: jest.fn().mockResolvedValue(undefined),
        });
    });

    test('rejects moving a project into a foreign workspace', async () => {
        const response = await request(app)
            .put('/api/projects/507f1f77bcf86cd799439013')
            .send({ workspaceId: '507f1f77bcf86cd799439012' });

        expect(response.status).toBe(403);
        const project = await LocalProject.findOne.mock.results[0].value;
        expect(project.save).not.toHaveBeenCalled();
    });

    test('allows moving a project into a workspace the caller belongs to', async () => {
        const workspaceId = '507f1f77bcf86cd799439014';
        Company.findOne.mockReturnValue(companyQuery({
            _id: workspaceId,
            owner: '507f1f77bcf86cd799439011',
        }));
        Company.findById.mockReturnValue(companyQuery({
            _id: workspaceId,
            owner: '507f1f77bcf86cd799439011',
        }));

        const response = await request(app)
            .put('/api/projects/507f1f77bcf86cd799439013')
            .send({ workspaceId });

        expect(response.status).toBe(200);
        const project = await LocalProject.findOne.mock.results[0].value;
        expect(project.workspaceId).toBe(workspaceId);
        expect(project.save).toHaveBeenCalled();
    });
});
