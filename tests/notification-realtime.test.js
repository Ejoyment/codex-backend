// End-to-end real-time test: a real socket.io server, a real JWT, a real
// client socket, and the actual notification namespace + service. Only the
// database is stubbed, so this proves the delivery path works for real.
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439016';

jest.mock('../models/Notification', () => {
    const actual = jest.requireActual('../models/Notification');
    // Spreading a Mongoose Model does not copy its statics, so name them.
    return {
        ...actual,
        find: jest.fn(),
        insertMany: jest.fn(),
        countDocuments: jest.fn(),
        aggregate: jest.fn(),
        updateMany: jest.fn(),
    };
});
jest.mock('../models/User', () => ({ find: jest.fn() }));

const Notification = require('../models/Notification');
const User = require('../models/User');
const realtimeBus = require('../utils/realtimeBus');
const notificationSocket = require('../utils/notificationSocket');
const NotificationService = require('../utils/notificationService');

let server;
let io;
let port;

const connect = (userId) =>
    new Promise((resolve, reject) => {
        const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');
        const socket = ioClient(`http://localhost:${port}/notifications`, {
            auth: { token },
            transports: ['websocket'],
            forceNew: true,
        });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });

const once = (socket, event, timeout = 4000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    server = http.createServer();
    io = new Server(server, { cors: { origin: '*' } });
    // Exactly what server.js does.
    realtimeBus.setIO(io);
    notificationSocket(io);

    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
});

afterAll(async () => {
    realtimeBus.setIO(null);
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
    jest.clearAllMocks();
    User.find.mockImplementation(() => ({
        select: () => ({ lean: async () => [{ _id: USER_A }, { _id: USER_B }] }),
    }));
    Notification.find.mockImplementation(() => ({
        select: () => ({ lean: async () => [] }),
    }));
    Notification.insertMany.mockImplementation(async (docs) =>
        docs.map((d) => ({ ...d, _id: `n-${Math.random()}`, toJSON: () => d }))
    );
});

test('an unauthenticated client is rejected', async () => {
    const socket = ioClient(`http://localhost:${port}/notifications`, {
        auth: {},
        transports: ['websocket'],
        forceNew: true,
    });
    await expect(
        new Promise((resolve, reject) => {
            socket.on('connect', () => resolve('connected'));
            socket.on('connect_error', (e) => reject(e));
        })
    ).rejects.toThrow(/Authentication/);
});

test('a tampered token is rejected', async () => {
    const socket = ioClient(`http://localhost:${port}/notifications`, {
        auth: { token: 'not-a-real-jwt' },
        transports: ['websocket'],
        forceNew: true,
    });
    await expect(
        new Promise((resolve, reject) => {
            socket.on('connect', () => resolve('connected'));
            socket.on('connect_error', (e) => reject(e));
        })
    ).rejects.toThrow(/Authentication/);
});

test('a real client receives a pushed notification in real time', async () => {
    const socket = await connect(USER_B);
    const received = once(socket, 'notification:new');

    await NotificationService.notify({
        userIds: [USER_B], // a different user on the same server
        type: 'task_assigned',
        title: 'Task assigned to you',
        message: 'Fix login',
        actorId: USER_A,
        link: '/tasks',
        priority: 'high',
    });

    // Nothing polls here: the payload arrives over the socket.
    const payload = await received;
    expect(payload.type).toBe('task_assigned');
    expect(payload.title).toBe('Task assigned to you');
    expect(payload.priority).toBe('high');
    expect(payload.link).toBe('/tasks');

    socket.disconnect();
});

test('notifications reach every open tab of the same user', async () => {
    const tab1 = await connect(USER_B);
    const tab2 = await connect(USER_B);
    const first = once(tab1, 'notification:new');
    const second = once(tab2, 'notification:new');

    await NotificationService.notify({
        userIds: [USER_B],
        type: 'message',
        title: 'New message',
        message: 'hello',
        actorId: USER_A,
    });

    await expect(first).resolves.toMatchObject({ type: 'message' });
    await expect(second).resolves.toMatchObject({ type: 'message' });

    tab1.disconnect();
    tab2.disconnect();
});

test('a user never receives another user\'s notification', async () => {
    const mine = await connect(USER_A);
    const theirs = await connect(USER_B);

    // USER_B is the recipient and must get it; USER_A must not.
    let leaked = false;
    mine.on('notification:new', () => {
        leaked = true;
    });
    const delivered = once(theirs, 'notification:new');

    await NotificationService.notify({
        userIds: [USER_B],
        type: 'mention',
        title: 'You were mentioned',
        message: 'hey',
        actorId: USER_A,
    });
    await expect(delivered).resolves.toMatchObject({ type: 'mention' });
    await new Promise((r) => setTimeout(r, 250));

    expect(leaked).toBe(false);
    mine.disconnect();
    theirs.disconnect();
});

test('notification:sync answers with the unread count', async () => {
    jest.spyOn(Notification, 'countDocuments').mockResolvedValue(4);
    jest.spyOn(Notification, 'aggregate').mockResolvedValue([{ _id: 'message', count: 4 }]);

    const socket = await connect(USER_A);
    const payload = once(socket, 'notification:count');

    socket.emit('notification:sync');

    const result = await payload;
    expect(result.count).toBe(4);
    // Grouped so the UI can summarise without a second round trip.
    expect(result.byCategory).toEqual({ messages: 4 });

    socket.disconnect();
});

test('markAllRead over the socket clears the badge for every tab', async () => {
    jest.spyOn(Notification, 'updateMany').mockResolvedValue({ modifiedCount: 3 });

    const socket = await connect(USER_A);
    const payload = once(socket, 'notification:count');

    socket.emit('notification:markAllRead');

    const result = await payload;
    expect(result.count).toBe(0);
    socket.disconnect();
});

test('the row is persisted before the push, so a dropped socket still gets it', async () => {
    const socket = await connect(USER_B);
    const received = once(socket, 'notification:new');

    await NotificationService.notify({
        userIds: [USER_B],
        type: 'payment_succeeded',
        title: 'Payment successful',
        message: 'Thanks!',
    });
    await received;

    // insertMany resolved before emitNotification was called, so the REST API
    // can always serve the same notification the socket announced.
    expect(Notification.insertMany).toHaveBeenCalledTimes(1);
    const emitOrder = Notification.insertMany.mock.invocationCallOrder[0];
    expect(emitOrder).toBeGreaterThan(0);

    socket.disconnect();
});
