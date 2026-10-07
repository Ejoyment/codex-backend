/**
 * Tenant-isolation tests for routes/messaging.js (audit rec 7, REST edges).
 *
 * Covers the six gaps found after the socket pass:
 *  1. GET /channels without companyId listed every tenant (mongoose strips
 *     `company: undefined`; requireCompanyMember passes on absent companyId)
 *  2. GET /messages without channelId dumped every tenant's messages
 *  3. POST /messages with companyId omitted skipped company membership
 *  4. GET /channels/:id opened private/direct channels to any company member
 *  5. reactions/read on channel-less (DM) messages had no access check —
 *     the reactions response echoes the full message (DM content disclosure)
 *  6. POST /channels/:id/members could invite users from other tenants
 */
const express = require('express');
const request = require('supertest');

const Channel = require('../models/Channel');
const Message = require('../models/Message');

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const COMPANY = '507f1f77bcf86cd799439013';
const CHANNEL_ID = '507f1f77bcf86cd799439099';

// Same stubbing strategy as messaging-channels.test.js: auth off, company
// membership stubbed discriminatingly (USER is a member of COMPANY).
jest.doMock('../middleware/auth', () => ({ authenticateToken: (req, res, next) => next() }));
jest.doMock('../models/Company', () => ({
    findById: jest.fn(() => ({
        select: () => Promise.resolve({ members: [{ user: { toString: () => USER } }] }),
    })),
    findOne: jest.fn(() => ({
        select: () => ({ lean: async () => ({ _id: COMPANY }) }),
    })),
}));

// Must come after jest.doMock: with the require above, this resolves to the
// mock (jest.fn), not the real Mongoose model.
const Company = require('../models/Company');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.userId = USER;
    req.user = { _id: USER };
    next();
});
app.use('/api/messaging', require('../routes/messaging'));

// A mongoose-ish query stub: chainable + awaitable, resolving to `doc`.
function queryFor(doc) {
    const q = {
        select: () => q,
        populate: () => q,
        sort: () => q,
        limit: () => q,
        then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
    return q;
}

function channelDoc(overrides = {}) {
    return {
        _id: CHANNEL_ID,
        company: COMPANY,
        type: 'public',
        archived: false,
        members: [{ user: USER, role: 'admin' }],
        save: jest.fn(async function () { return this; }),
        populate: function () { return this; },
        ...overrides,
    };
}

let channelsById;

beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps implementations — restore the discriminating defaults
    // (per-test overrides above must not leak into later tests).
    Company.findById.mockImplementation(() => ({
        select: () => Promise.resolve({ members: [{ user: { toString: () => USER } }] }),
    }));
    Company.findOne.mockImplementation(() => ({
        select: () => ({ lean: async () => ({ _id: COMPANY }) }),
    }));
    channelsById = { [CHANNEL_ID]: channelDoc() };
    jest.spyOn(Channel, 'findById').mockImplementation((id) => queryFor(channelsById[String(id)] || null));
    jest.spyOn(Channel, 'find').mockImplementation(() => queryFor([]));
    jest.spyOn(Message, 'find').mockImplementation(() => queryFor([]));
    jest.spyOn(Message, 'create').mockImplementation(async (doc) => ({
        ...doc, populate: async function () { return this; },
    }));
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('GET /api/messaging/channels', () => {
    test('requires companyId (previously listed all tenants)', async () => {
        const res = await request(app).get('/api/messaging/channels');
        expect(res.status).toBe(400);
        expect(Channel.find).not.toHaveBeenCalled();
    });

    test('scopes the query to the company when companyId is given', async () => {
        const res = await request(app).get(`/api/messaging/channels?companyId=${COMPANY}`);
        expect(res.status).toBe(200);
        expect(Channel.find).toHaveBeenCalledWith(expect.objectContaining({ company: COMPANY }));
    });
});

describe('GET /api/messaging/messages', () => {
    test('requires channelId (previously dumped all tenants)', async () => {
        const res = await request(app).get('/api/messaging/messages');
        expect(res.status).toBe(400);
        expect(Message.find).not.toHaveBeenCalled();
    });

    test('member can read channel history', async () => {
        const res = await request(app).get(`/api/messaging/messages?channelId=${CHANNEL_ID}`);
        expect(res.status).toBe(200);
        expect(Message.find).toHaveBeenCalledWith(expect.objectContaining({ channel: CHANNEL_ID }));
    });
});

describe('GET /api/messaging/channels/:id', () => {
    test('private channel stays closed to non-member company members', async () => {
        channelsById[CHANNEL_ID] = channelDoc({ type: 'private', members: [{ user: OTHER, role: 'admin' }] });
        const res = await request(app).get(`/api/messaging/channels/${CHANNEL_ID}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not a channel member/i);
    });

    test('public channel opens to company members', async () => {
        channelsById[CHANNEL_ID] = channelDoc({ type: 'public', members: [{ user: OTHER, role: 'admin' }] });
        const res = await request(app).get(`/api/messaging/channels/${CHANNEL_ID}`);
        expect(res.status).toBe(200);
    });
});

describe('POST /api/messaging/messages company inference', () => {
    test('rejects when the caller is not a member of the channel company (companyId omitted)', async () => {
        Company.findOne.mockImplementation(() => ({
            select: () => ({ lean: async () => null }),
        }));
        const res = await request(app)
            .post('/api/messaging/messages')
            .send({ content: 'hi', channelId: CHANNEL_ID });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not a company member/i);
        expect(Message.create).not.toHaveBeenCalled();
    });
});

describe('DM (channel-less) message access', () => {
    function dmDoc(overrides = {}) {
        return {
            _id: '507f1f77bcf86cd799439055',
            channel: null,
            sender: OTHER,
            recipient: '507f1f77bcf86cd799439077',
            content: 'top secret dm',
            reactions: [],
            readBy: [],
            save: jest.fn(async function () { return this; }),
            ...overrides,
        };
    }

    beforeEach(() => {
        jest.spyOn(Message, 'findById').mockImplementation(async () => dmDoc());
    });

    test('non-party cannot react and cannot see the message content', async () => {
        const doc = dmDoc();
        Message.findById.mockImplementation(async () => doc);
        const res = await request(app)
            .post(`/api/messaging/messages/${CHANNEL_ID}/reactions`)
            .send({ emoji: '👍' });
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toMatch(/top secret dm/);
        expect(doc.save).not.toHaveBeenCalled();
    });

    test('recipient can react', async () => {
        Message.findById.mockImplementation(async () => dmDoc({ recipient: USER }));
        const res = await request(app)
            .post(`/api/messaging/messages/${CHANNEL_ID}/reactions`)
            .send({ emoji: '👍' });
        expect(res.status).toBe(200);
    });

    test('non-party cannot mark a DM as read', async () => {
        const res = await request(app).post(`/api/messaging/messages/${CHANNEL_ID}/read`);
        expect(res.status).toBe(403);
    });

    test('sender can mark their own DM as read', async () => {
        Message.findById.mockImplementation(async () => dmDoc({ sender: USER }));
        const res = await request(app).post(`/api/messaging/messages/${CHANNEL_ID}/read`);
        expect(res.status).toBe(200);
    });
});

describe('POST /api/messaging/channels/:id/members', () => {
    test('requires userId', async () => {
        const res = await request(app)
            .post(`/api/messaging/channels/${CHANNEL_ID}/members`)
            .send({});
        expect(res.status).toBe(400);
    });

    test('cannot invite a user from another tenant', async () => {
        Company.findOne.mockImplementation(() => ({
            select: () => ({ lean: async () => null }),
        }));
        const res = await request(app)
            .post(`/api/messaging/channels/${CHANNEL_ID}/members`)
            .send({ userId: OTHER });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not a company member/i);
        expect(channelsById[CHANNEL_ID].save).not.toHaveBeenCalled();
    });

    test('can invite a fellow company member', async () => {
        const res = await request(app)
            .post(`/api/messaging/channels/${CHANNEL_ID}/members`)
            .send({ userId: OTHER });
        expect(res.status).toBe(200);
        expect(channelsById[CHANNEL_ID].save).toHaveBeenCalled();
    });
});
