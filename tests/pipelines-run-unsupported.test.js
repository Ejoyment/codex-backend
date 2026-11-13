const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    },
}));

jest.mock('../models/Pipeline');
jest.mock('../models/PipelineRun');
jest.mock('../models/Company');
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));

const Pipeline = require('../models/Pipeline');
const PipelineRun = require('../models/PipelineRun');
const Company = require('../models/Company');
const pipelinesRouter = require('../routes/pipelines');

const app = express();
app.use(express.json());
app.use('/api/pipelines', pipelinesRouter);

const OWNER_ID = '507f1f77bcf86cd799439011';

describe('POST /api/pipelines/:id/run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Pipeline.findById.mockResolvedValue({
            _id: 'pipeline-1',
            company: 'company-1',
            name: 'Build and test',
            stages: [{ name: 'Install', command: 'npm ci' }],
        });
        Company.findById.mockResolvedValue({ owner: OWNER_ID, members: [] });
    });

    test('refuses to simulate a successful run', async () => {
        const res = await request(app).post('/api/pipelines/pipeline-1/run');

        expect(res.status).toBe(501);
        expect(res.body).toMatchObject({
            success: false,
            code: 'PIPELINE_EXECUTION_UNAVAILABLE',
        });
        expect(PipelineRun.create).not.toHaveBeenCalled();
    });

    test('still enforces pipeline access before refusing', async () => {
        Company.findById.mockResolvedValue({ owner: 'someone-else', members: [] });

        const res = await request(app).post('/api/pipelines/pipeline-1/run');

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});
