/**
 * Channel creation / message posting contract.
 *
 * The messaging page used to send type "group"/"announcement" while the schema
 * only allowed public/private/direct, so every create failed validation and the
 * UI swallowed the 500. Message.create() also requires a companyId that the
 * page never sent.
 */

const express = require('express');
const request = require('supertest');

const Channel = require('../models/Channel');
const Message = require('../models/Message');

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const COMPANY = '507f1f77bcf86cd799439013';

// Mount the real route with auth/company membership stubbed out, so the tests
// exercise the handler's validation and vocabulary rather than auth wiring.
// The app is built once: rebuilding it with jest.resetModules() would make the
// router load its own Channel/Message module instances and the stubs below
// would miss, sending real queries to a database that isn't there.
jest.doMock('../middleware/auth', () => ({ authenticateToken: (req, res, next) => next() }));
jest.doMock('../models/Company', () => ({
    // requireCompanyMember chains .select('members')
    findById: jest.fn(() => ({
        select: () => Promise.resolve({ members: [{ user: { toString: () => USER } }] }),
    })),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.userId = USER;
    req.user = { _id: USER };
    next();
});
app.use('/api/messaging', require('../routes/messaging'));

describe('POST /api/messaging/channels', () => {
    let created;

    beforeEach(() => {
        created = [];
        jest.spyOn(Channel, 'create').mockImplementation(async (doc) => {
            const channel = new Channel(doc);
            await channel.validate();
            created.push(channel);
            return channel;
        });
        // the duplicate check chains .select('_id') on the returned query
        jest.spyOn(Channel, 'findOne').mockImplementation(() => ({
            select: () => Promise.resolve(null),
        }));
        jest.spyOn(Channel.prototype, 'populate').mockImplementation(async function () {
            return this;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test.each([
        ['group', 'public'],
        ['announcement', 'announcement'],
        ['public', 'public'],
        ['private', 'private'],
        ['direct', 'direct'],
    ])('accepts type "%s" and stores "%s"', async (sent, stored) => {
        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY, type: sent });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(created[0].type).toBe(stored);
    });

    test('defaults to public when no type is given', async () => {
        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY });

        expect(res.status).toBe(201);
        expect(created[0].type).toBe('public');
    });

    test('the creator is an admin member', async () => {
        await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY, type: 'group' });

        expect(created[0].members).toHaveLength(1);
        expect(String(created[0].members[0].user)).toBe(USER);
        expect(created[0].members[0].role).toBe('admin');
    });

    test('requested members become non-admin members, creator not duplicated', async () => {
        await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY, members: [OTHER, USER] });

        expect(created[0].members).toHaveLength(2);
        expect(created[0].members.filter(m => m.role === 'admin')).toHaveLength(1);
    });

    test('rejects a blank name with 400, not 500', async () => {
        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: '   ', companyId: COMPANY });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('rejects a missing companyId with 400', async () => {
        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general' });

        expect(res.status).toBe(400);
    });

    test('rejects an unknown type with 400 and names the valid options', async () => {
        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY, type: 'nonsense' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/announcement/);
    });

    test('rejects a duplicate name in the same company with 409', async () => {
        Channel.findOne.mockImplementation(() => ({
            select: () => Promise.resolve({ _id: 'existing' }),
        }));

        const res = await request(app)
            .post('/api/messaging/channels')
            .send({ name: 'general', companyId: COMPANY });

        expect(res.status).toBe(409);
        expect(Channel.create).not.toHaveBeenCalled();
    });
});

describe('POST /api/messaging/messages', () => {
    let sent;

    function channelDoc(overrides = {}) {
        return {
            _id: '507f1f77bcf86cd799439099',
            company: COMPANY,
            type: 'public',
            members: [{ user: USER, role: 'admin' }],
            ...overrides,
        };
    }

    beforeEach(() => {
        sent = [];
        // the handler chains .select('company members type') on the query
        jest.spyOn(Channel, 'findById').mockImplementation(() => ({
            select: () => Promise.resolve(channelDoc()),
        }));
        jest.spyOn(Channel, 'findByIdAndUpdate').mockImplementation(async () => ({}));
        jest.spyOn(Message, 'create').mockImplementation(async (doc) => {
            const m = new Message(doc);
            await m.validate();
            sent.push(m);
            return m;
        });
        jest.spyOn(Message.prototype, 'populate').mockImplementation(async function () {
            return this;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('infers companyId from the channel when the client omits it', async () => {
        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'hello', channelId: '507f1f77bcf86cd799439099' });

        expect(res.status).toBe(200);
        expect(String(sent[0].company)).toBe(COMPANY);
    });

    test('rejects empty content with 400', async () => {
        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: '   ', channelId: '507f1f77bcf86cd799439099' });

        expect(res.status).toBe(400);
        expect(Message.create).not.toHaveBeenCalled();
    });

    test('non-member cannot post', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve(channelDoc({ members: [{ user: OTHER, role: 'admin' }] })),
        }));

        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'hi', channelId: '507f1f77bcf86cd799439099' });

        expect(res.status).toBe(403);
        expect(Message.create).not.toHaveBeenCalled();
    });

    test('non-admin cannot post in an announcement channel', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve(
                channelDoc({ type: 'announcement', members: [{ user: USER, role: 'member' }] })
            ),
        }));

        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'hi', channelId: '507f1f77bcf86cd799439099' });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/admins/);
    });

    test('admin can post in an announcement channel', async () => {
        Channel.findById.mockImplementation(() => ({
            select: () => Promise.resolve(channelDoc({ type: 'announcement' })),
        }));

        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'shipping now', channelId: '507f1f77bcf86cd799439099' });

        expect(res.status).toBe(200);
        expect(sent).toHaveLength(1);
    });

    test('rejects a channelId from a different company', async () => {
        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'hi', channelId: '507f1f77bcf86cd799439099', companyId: OTHER });

        expect(res.status).toBe(403);
    });
});
