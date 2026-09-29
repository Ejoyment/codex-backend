/**
 * Standup submission.
 *
 * Three reported bugs: the history rendered "Invalid Date" because the page read
 * `timestamp` from server documents that only carry `createdAt`; the standup
 * "didn't post to the channel" because the route never created a Message; and
 * submission was allowed with no task selected.
 */

const express = require('express');
const request = require('supertest');

const Standup = require('../models/Standup');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const LocalTask = require('../models/LocalTask');

const USER = '507f1f77bcf86cd799439011';
const COMPANY = '507f1f77bcf86cd799439013';
const CHANNEL = '507f1f77bcf86cd799439014';
const TASK = '507f1f77bcf86cd799439015';

jest.doMock('../middleware/auth', () => ({ authenticateToken: (req, res, next) => next() }));
jest.doMock('../models/Company', () => ({
    findById: jest.fn(() => {
        const doc = {
            owner: { toString: () => USER },
            members: [{ user: { toString: () => USER } }],
        };
        // A mongoose Query is both awaitable and chainable; the route awaits it.
        return { select: () => Promise.resolve(doc), then: (r, e) => Promise.resolve(doc).then(r, e) };
    }),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.userId = USER;
    req.user = { _id: USER, fullName: 'Ada Lovelace' };
    next();
});
app.use('/api/standup', require('../routes/standup'));

describe('POST /api/standup', () => {
    let createdStandups;
    let createdMessages;
    let channelUpdate;

    beforeEach(() => {
        createdStandups = [];
        createdMessages = [];
        channelUpdate = null;

        jest.spyOn(Standup, 'create').mockImplementation(async (doc) => {
            const s = new Standup(doc);
            await s.validate();
            // A real save stamps these; the mock bypasses it, so set them here
            // or the response would look different from production.
            const now = new Date();
            s.createdAt = now;
            s.updatedAt = now;
            s.populate = async () => s;
            createdStandups.push(s);
            return s;
        });
        jest.spyOn(Channel, 'findById').mockImplementation(() => ({
            select: () => Promise.resolve({
                _id: CHANNEL,
                name: 'general',
                company: COMPANY,
                type: 'public',
                members: [{ user: USER, role: 'admin' }],
            }),
        }));
        jest.spyOn(Channel, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
            channelUpdate = { id, update };
            return {};
        });
        jest.spyOn(LocalTask, 'find').mockImplementation(() => ({
            select: () => Promise.resolve([{ _id: TASK, title: 'Fix login', status: 'in-progress' }]),
        }));
        jest.spyOn(Message, 'create').mockImplementation(async (doc) => {
            const m = new Message(doc);
            await m.validate();
            createdMessages.push(m);
            return m;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const validBody = (overrides = {}) => ({
        companyId: COMPANY,
        channelId: CHANNEL,
        yesterday: 'shipped auth',
        today: 'billing',
        blockers: '',
        relatedTasks: [TASK],
        ...overrides,
    });

    test('posts a message into the selected channel', async () => {
        const res = await request(app).post('/api/standup').send(validBody());

        expect(res.status).toBe(201);
        expect(res.body.delivered).toBe(true);
        expect(createdMessages).toHaveLength(1);
        expect(String(createdMessages[0].channel)).toBe(CHANNEL);
        expect(String(createdMessages[0].company)).toBe(COMPANY);
        expect(String(createdMessages[0].sender)).toBe(USER);
    });

    test('the channel message carries the standup content and task titles', async () => {
        await request(app).post('/api/standup').send(validBody());

        const content = createdMessages[0].content;
        expect(content).toContain('Ada Lovelace');
        expect(content).toContain('shipped auth');
        expect(content).toContain('billing');
        expect(content).toContain('Fix login');
    });

    test('updates the channel last-message pointer', async () => {
        await request(app).post('/api/standup').send(validBody());

        expect(channelUpdate).not.toBeNull();
        expect(String(channelUpdate.id)).toBe(CHANNEL);
        expect(channelUpdate.update.lastMessageAt).toBeInstanceOf(Date);
    });

    test('stores the standup against the selected channel', async () => {
        const res = await request(app).post('/api/standup').send(validBody());

        expect(String(createdStandups[0].channel)).toBe(CHANNEL);
        expect(res.body.channelId).toBe(CHANNEL);
    });

    test('the schema stamps createdAt, which is the date the history renders', async () => {
        // The page previously read `timestamp`; server documents only carry
        // `createdAt`, which Mongoose applies on save via schema timestamps.
        expect(Standup.schema.options.timestamps).toBeTruthy();

        const res = await request(app).post('/api/standup').send(validBody());
        // The standup payload must not be a bare object that hides its own date.
        expect(res.body.standup).not.toHaveProperty('timestamp');
        expect(res.body.standup).toHaveProperty('createdAt');
    });

    test('rejects a standup with no related task', async () => {
        const res = await request(app).post('/api/standup').send(validBody({ relatedTasks: [] }));

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/task/i);
        expect(Standup.create).not.toHaveBeenCalled();
        expect(Message.create).not.toHaveBeenCalled();
    });

    test('rejects a standup with no channel', async () => {
        const res = await request(app).post('/api/standup').send(validBody({ channelId: '' }));

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/channel/i);
        expect(Standup.create).not.toHaveBeenCalled();
    });

    test('rejects a channel from another workspace', async () => {
        const res = await request(app)
            .post('/api/standup')
            .send(validBody({ companyId: '507f1f77bcf86cd799439099' }));

        expect(res.status).toBe(403);
    });

    test('rejects posting to an announcement channel as a non-admin', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve({
                _id: CHANNEL,
                company: COMPANY,
                type: 'announcement',
                members: [{ user: USER, role: 'member' }],
            }),
        }));

        const res = await request(app).post('/api/standup').send(validBody());

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/admins/);
        expect(Message.create).not.toHaveBeenCalled();
    });

    test('rejects a user who is not a channel member', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve({
                _id: CHANNEL,
                company: COMPANY,
                type: 'public',
                members: [{ user: '507f1f77bcf86cd799439099', role: 'admin' }],
            }),
        }));

        const res = await request(app).post('/api/standup').send(validBody());

        expect(res.status).toBe(403);
    });

    test('rejects an unknown channel with 404', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve(null),
        }));

        const res = await request(app).post('/api/standup').send(validBody());

        expect(res.status).toBe(404);
    });

    test('rejects task ids that do not resolve', async () => {
        LocalTask.find.mockImplementation(() => ({
            select: () => Promise.resolve([]),
        }));

        const res = await request(app).post('/api/standup').send(validBody());

        expect(res.status).toBe(400);
        expect(Standup.create).not.toHaveBeenCalled();
    });

    test('reports delivered:false when the channel post fails', async () => {
        Message.create.mockImplementation(async () => {
            throw new Error('write concern error');
        });

        const res = await request(app).post('/api/standup').send(validBody());

        // The standup record exists, so this must not look like a clean success.
        expect(res.status).toBe(201);
        expect(res.body.delivered).toBe(false);
        expect(res.body.message).toMatch(/channel/i);
    });
});
