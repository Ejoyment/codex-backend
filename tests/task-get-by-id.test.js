/**
 * GET /api/projects/tasks/:taskId — fetch a single task by ID.
 *
 * The route used to exist only as PUT, so `GET /api/projects/tasks/<id>`
 * fell through to the global 404 handler. Covers:
 *  - happy path returns the task
 *  - the response shape matches GET /api/projects/tasks (shared serializer)
 *  - owner scoping (a foreign task is a 404, never a 200)
 *  - malformed id is a 404, not a 500
 *  - missing/invalid token is rejected before any lookup
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/LocalTask', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/LocalProject', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/CodeFile', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));

const LocalTask = require('../models/LocalTask');
const User = require('../models/User');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/projects', require('../routes/projects'));

const OWNER = 'userA';
const OTHER = 'userB';
const TASK_ID = new mongoose.Types.ObjectId().toString();

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

const taskDoc = () => ({
    _id: TASK_ID,
    userId: OWNER,
    title: 'Ship the thing',
    description: 'desc',
    status: 'in_progress',
    priority: 'high',
    taskType: 'local',
    projectId: null,
    companyId: null,
    specIds: [],
    figmaNodeId: null,
    blockedBy: [],
    branch: 'feature/x',
    pullRequestId: null,
    agentSessionId: null,
    agentExecution: { status: 'idle' },
    dueDate: null,
    labels: ['backend'],
    assignee: null,
    assigneeName: null,
    githubIssueUrl: null,
    githubIssueNumber: null,
    githubRepoName: null,
    isPushedToGit: false,
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
});

beforeEach(() => {
    jest.clearAllMocks();
    clearLivenessCache();
    User.exists.mockResolvedValue({ _id: OWNER });
    LocalTask.findOne.mockResolvedValue(taskDoc());
});

describe('GET /api/projects/tasks/:taskId', () => {
    test('returns the task', async () => {
        const res = await request(app)
            .get(`/api/projects/tasks/${TASK_ID}`)
            .set(auth(OWNER));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.task).toBeDefined();
        expect(res.body.task.id).toBe(TASK_ID);
        expect(res.body.task.title).toBe('Ship the thing');
        expect(res.body.task.status).toBe('in_progress');
    });

    test('scopes the lookup to the caller', async () => {
        await request(app)
            .get(`/api/projects/tasks/${TASK_ID}`)
            .set(auth(OWNER));

        expect(LocalTask.findOne).toHaveBeenCalledWith({ _id: TASK_ID, userId: OWNER });
    });

    test('another user cannot read the task', async () => {
        LocalTask.findOne.mockResolvedValue(null);

        const res = await request(app)
            .get(`/api/projects/tasks/${TASK_ID}`)
            .set(auth(OTHER));

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, message: 'Task not found' });
    });

    test('malformed id returns 404 rather than a cast error', async () => {
        const res = await request(app)
            .get('/api/projects/tasks/not-an-object-id')
            .set(auth(OWNER));

        expect(res.status).toBe(404);
        expect(LocalTask.findOne).not.toHaveBeenCalled();
    });

    test('requires a token', async () => {
        const res = await request(app).get(`/api/projects/tasks/${TASK_ID}`);

        expect(res.status).toBe(401);
        expect(LocalTask.findOne).not.toHaveBeenCalled();
    });

    test('returns the same shape as GET /api/projects/tasks', async () => {
        LocalTask.find.mockReturnValue({
            sort: jest.fn().mockResolvedValue([taskDoc()]),
        });

        const listRes = await request(app)
            .get('/api/projects/tasks')
            .set(auth(OWNER));
        const oneRes = await request(app)
            .get(`/api/projects/tasks/${TASK_ID}`)
            .set(auth(OWNER));

        expect(listRes.status).toBe(200);
        expect(oneRes.status).toBe(200);
        expect(Object.keys(oneRes.body.task).sort()).toEqual(
            Object.keys(listRes.body.tasks[0]).sort()
        );
    });
});
