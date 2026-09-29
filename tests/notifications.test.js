const express = require('express');
const request = require('supertest');

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439016';
const COMPANY = '507f1f77bcf86cd799439013';

jest.doMock('../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.userId = req.headers['x-user-id'] || USER;
        req.user = { _id: req.userId, fullName: 'Ada' };
        next();
    },
}));

const Notification = require('../models/Notification');
const User = require('../models/User');
const NotificationService = require('../utils/notificationService');
const realtimeBus = require('../utils/realtimeBus');
const app = express();

let insertManySpy;
let emitSpy;

beforeEach(() => {
    jest.clearAllMocks();
    const now = new Date();
    insertManySpy = jest.spyOn(Notification, 'insertMany').mockImplementation(async (docs) =>
        docs.map((d) => ({ ...d, _id: `${Math.random()}`, toJSON: () => d }))
    );
    emitSpy = jest.spyOn(realtimeBus, 'emitNotification').mockImplementation(() => true);
    jest.spyOn(User, 'find').mockImplementation(() => ({
        select: () => ({
            lean: async () => [
                { _id: USER, notificationPrefs: { enabled: true, categories: { messages: true } } },
                { _id: OTHER, notificationPrefs: { enabled: true, categories: { messages: true } } },
            ],
        }),
    }));
    jest.spyOn(Notification, 'find').mockImplementation(() => {
        // Support every chain the service uses: select/sort/skip/limit -> lean
        const chain = {
            select: () => chain,
            sort: () => chain,
            skip: () => chain,
            limit: () => chain,
            lean: async () => [],
        };
        return chain;
    });
    jest.spyOn(Notification, 'aggregate').mockResolvedValue([
        { _id: 'mention', count: 2 },
        { _id: 'message', count: 1 },
    ]);
    jest.spyOn(Notification, 'countDocuments').mockResolvedValue(3);
});

afterEach(() => jest.restoreAllMocks());

function app_() {
    const server = express();
    server.use(express.json());
    server.use('/api/notifications', require('../routes/notifications'));
    return server;
}

describe('NotificationService.notify', () => {
    test('persists one row per recipient and pushes each over the socket', async () => {
        const result = await NotificationService.notify({
            userIds: [USER, OTHER],
            type: 'mention',
            title: 'Ada mentioned you',
            message: 'look at this',
        });

        expect(result.created).toBe(2);
        expect(insertManySpy).toHaveBeenCalledTimes(1);
        expect(insertManySpy.mock.calls[0][0]).toHaveLength(2);
        // Real-time delivery is the whole point: both recipients get a push.
        expect(emitSpy).toHaveBeenCalledTimes(2);
    });

    test('never notifies the actor about their own action', async () => {
        const result = await NotificationService.notify({
            userIds: [USER, OTHER],
            type: 'message',
            title: 't',
            message: 'm',
            actorId: USER,
        });

        expect(result.created).toBe(1);
        const recipients = insertManySpy.mock.calls[0][0].map((d) => d.userId);
        expect(recipients).not.toContain(USER);
        expect(recipients).toContain(OTHER);
    });

    test('a notification failure never throws into the caller', async () => {
        insertManySpy.mockRejectedValueOnce(new Error('db is down'));

        const result = await NotificationService.notify({
            userIds: [USER],
            type: 'message',
            title: 't',
            message: 'm',
        });

        expect(result.created).toBe(0);
        expect(result.error).toContain('db is down');
    });

    test('collapses repeats of the same event inside the dedupe window', async () => {
        jest.spyOn(Notification, 'find').mockImplementation(() => ({
            select: () => ({ lean: async () => [{ userId: OTHER }] }),
        }));

        const result = await NotificationService.notify({
            userIds: [USER, OTHER],
            type: 'message',
            title: 't',
            message: 'm',
            dedupeKey: 'channel:abc',
        });

        // OTHER already had this event, so only USER is notified.
        expect(result.created).toBe(1);
        expect(insertManySpy.mock.calls[0][0][0].userId).toBe(USER);
    });

    test('respects a user who turned a category off', async () => {
        jest.spyOn(User, 'find').mockImplementation(() => ({
            select: () => ({
                lean: async () => [
                    { _id: USER, notificationPrefs: { enabled: true, categories: { messages: false } } },
                ],
            }),
        }));

        const result = await NotificationService.notify({
            userIds: [USER],
            type: 'message',
            title: 't',
            message: 'm',
        });

        expect(result.created).toBe(0);
        expect(insertManySpy).not.toHaveBeenCalled();
    });

    test('respects the master switch', async () => {
        jest.spyOn(User, 'find').mockImplementation(() => ({
            select: () => ({
                lean: async () => [{ _id: USER, notificationPrefs: { enabled: false } }],
            }),
        }));

        const result = await NotificationService.notify({
            userIds: [USER],
            type: 'message',
            title: 't',
            message: 'm',
        });
        expect(result.created).toBe(0);
    });

    test('does not gate unknown/system types on a category toggle', async () => {
        jest.spyOn(User, 'find').mockImplementation(() => ({
            select: () => ({
                lean: async () => [{ _id: USER, notificationPrefs: { enabled: true } }],
            }),
        }));

        const result = await NotificationService.notify({
            userIds: [USER],
            type: 'system_alert',
            title: 't',
            message: 'm',
        });
        expect(result.created).toBe(1);
    });
});

describe('GET /api/notifications', () => {
    test('returns the list plus the unread count', async () => {
        const res = await request(app_()).get('/api/notifications');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.notifications)).toBe(true);
        expect(res.body.count).toBe(3);
    });

    test('scopes the query to the authenticated user', async () => {
        const findSpy = jest.spyOn(Notification, 'find').mockImplementation((query) => {
            expect(query.userId).toBe(OTHER);
            const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
            return chain;
        });

        const res = await request(app_())
            .get('/api/notifications')
            .set('x-user-id', OTHER);

        expect(res.status).toBe(200);
        expect(findSpy).toHaveBeenCalled();
    });
});

describe('mutation endpoints', () => {
    test('mark-as-read is scoped to the owner', async () => {
        const updateSpy = jest.spyOn(Notification, 'findOneAndUpdate');

        await request(app_()).put('/api/notifications/abc/read').set('x-user-id', USER);

        // The userId in the filter is what stops one user reading another's.
        expect(updateSpy.mock.calls[0][0]).toEqual({ _id: 'abc', userId: USER });
    });

    test('404s when the notification is not yours', async () => {
        jest.spyOn(Notification, 'findOneAndUpdate').mockReturnValue({
            lean: async () => null,
        });

        const res = await request(app_()).put('/api/notifications/abc/read');
        expect(res.status).toBe(404);
    });

    test('mark-all-read only touches unread rows for that user', async () => {
        const manySpy = jest.spyOn(Notification, 'updateMany').mockResolvedValue({
            modifiedCount: 4,
        });

        const res = await request(app_()).put('/api/notifications/read-all');

        expect(res.status).toBe(200);
        expect(manySpy.mock.calls[0][0]).toEqual({ userId: USER, read: false });
        expect(res.body.modifiedCount).toBe(4);
    });

    test('delete is scoped to the owner', async () => {
        const delSpy = jest.spyOn(Notification, 'findOneAndDelete');

        await request(app_()).delete('/api/notifications/abc');

        expect(delSpy.mock.calls[0][0]).toEqual({ _id: 'abc', userId: USER });
    });

    test('DELETE /read-all is reachable, not swallowed by /:id', async () => {
        // Express matches in declaration order: if '/:id' is registered first,
        // '/read-all' resolves to id='read-all' and this endpoint dies silently.
        const delManySpy = jest
            .spyOn(Notification, 'deleteMany')
            .mockResolvedValue({ deletedCount: 6 });

        const res = await request(app_()).delete('/api/notifications/read-all');

        expect(res.status).toBe(200);
        expect(res.body.deletedCount).toBe(6);
        expect(delManySpy.mock.calls[0][0]).toEqual({ userId: USER, read: true });
    });
});

describe('GET/PUT /api/notifications/preferences', () => {
    test('GET returns defaults when the user has none set', async () => {
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({}) }) });

        const res = await request(app_()).get('/api/notifications/preferences');

        expect(res.status).toBe(200);
        expect(res.body.preferences.sound).toBe(true);
        expect(res.body.preferences.categories.messages).toBe(true);
    });

    test('PUT persists only the booleans it recognises', async () => {
        const updateSpy = jest.spyOn(User, 'updateOne').mockResolvedValue({});
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({}) }) });

        const res = await request(app_())
            .put('/api/notifications/preferences')
            .send({ sound: false, bogus: 'nope', categories: { agents: false, injected: 'x' } });

        expect(res.status).toBe(200);
        const set = updateSpy.mock.calls[0][1].$set;
        expect(set['notificationPrefs.sound']).toBe(false);
        expect(set['notificationPrefs.categories.agents']).toBe(false);
        // Unknown keys are ignored, not written straight to the document.
        expect(Object.keys(set)).toHaveLength(2);
    });
});
