const express = require('express');
const request = require('supertest');

const USER = '507f1f77bcf86cd799439011';

jest.doMock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = USER;
        req.user = { _id: USER };
        next();
    },
}));

const Notification = require('../models/Notification');
const app = express();
app.use(express.json());
app.use('/api/notifications', require('../routes/notifications'));

function findChain(captured) {
    const chain = {
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        lean: async () => [],
    };
    return chain;
}

describe('notification selection endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Notification, 'find').mockImplementation(findChain);
        jest.spyOn(Notification, 'aggregate').mockResolvedValue([]);
        jest.spyOn(Notification, 'countDocuments').mockResolvedValue(5);
    });

    afterEach(() => jest.restoreAllMocks());

    test('GET supports readOnly filter and returns total counts', async () => {
        const findSpy = jest.spyOn(Notification, 'find');

        const res = await request(app).get('/api/notifications?readOnly=true');

        expect(res.status).toBe(200);
        expect(findSpy.mock.calls[0][0]).toEqual({ userId: USER, read: true });
        expect(res.body.total).toBe(5);
        expect(res.body.filteredTotal).toBe(0); // total 5 - unread 5
    });

    test('PUT /:id/unread is scoped to the owner', async () => {
        const updateSpy = jest.spyOn(Notification, 'findOneAndUpdate').mockReturnValue({
            lean: async () => ({ _id: 'abc', read: false }),
        });

        const res = await request(app).put('/api/notifications/abc/unread');

        expect(res.status).toBe(200);
        expect(res.body.notification.read).toBe(false);
        expect(updateSpy.mock.calls[0][0]).toEqual({ _id: 'abc', userId: USER });
        expect(updateSpy.mock.calls[0][1]).toEqual({ read: false, readAt: null });
    });

    test('bulk DELETE removes only the caller rows for the given ids', async () => {
        const delSpy = jest.spyOn(Notification, 'deleteMany').mockResolvedValue({ deletedCount: 2 });

        const res = await request(app)
            .delete('/api/notifications')
            .send({ ids: ['507f1f77bcf86cd7994390aa', '507f1f77bcf86cd7994390bb', 'not-an-id'] });

        expect(res.status).toBe(200);
        expect(res.body.deletedCount).toBe(2);
        expect(delSpy.mock.calls[0][0]).toEqual({
            userId: USER,
            _id: { $in: ['507f1f77bcf86cd7994390aa', '507f1f77bcf86cd7994390bb'] },
        });
    });

    test('bulk DELETE is reachable, not swallowed by /:id, and rejects empty ids', async () => {
        const singleSpy = jest.spyOn(Notification, 'findOneAndDelete');
        jest.spyOn(Notification, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

        const ok = await request(app).delete('/api/notifications').send({ ids: ['507f1f77bcf86cd7994390aa'] });
        expect(ok.status).toBe(200);
        expect(singleSpy).not.toHaveBeenCalled();

        const empty = await request(app).delete('/api/notifications').send({ ids: [] });
        expect(empty.status).toBe(400);
    });
});
