jest.mock('../models/Notification', () => {
    const actual = jest.requireActual('../models/Notification');
    return { ...actual, insertMany: jest.fn(), find: jest.fn() };
});
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../utils/realtimeBus', () => ({ emitNotification: jest.fn(() => true) }));

const { NOTIFICATION_TYPES } = require('../models/Notification');
const NotificationService = require('../utils/notificationService');
const triggers = require('../utils/notificationTriggers');
const Notification = require('../models/Notification');
const User = require('../models/User');

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
    User.find.mockImplementation(() => ({
        select: () => ({ lean: async () => [] }), // no prefs object => all enabled
    }));
    Notification.insertMany.mockImplementation(async (docs) =>
        docs.map((d) => ({ ...d, _id: `n${Math.random()}`, toJSON: () => d }))
    );
    Notification.find.mockImplementation(() => ({
        select: () => ({ lean: async () => [] }),
    }));
});

describe('realtime bridge', () => {
    test('emitNotification reaches the user room on the notifications namespace', () => {
        const emit = jest.fn();
        const to = jest.fn(() => ({ emit }));
        const of = jest.fn(() => ({ to }));
        const fakeIo = { of };

        // The shared singleton is what routes reach; set it like server.js does.
        const bus = jest.requireActual('../utils/realtimeBus');
        bus.setIO(fakeIo);

        expect(bus.emitNotification('u1', { _id: 'x' })).toBe(true);
        expect(of).toHaveBeenCalledWith('/notifications');
        expect(to).toHaveBeenCalledWith('user:u1');
        expect(emit).toHaveBeenCalledWith('notification:new', { _id: 'x' });
    });

    test('a missing socket is a no-op, not a crash', () => {
        const bus = jest.requireActual('../utils/realtimeBus');
        bus.setIO(null);
        expect(bus.emitNotification('u1', {})).toBe(false);
    });

    test('a persistence failure is reported without throwing', async () => {
        Notification.insertMany.mockRejectedValueOnce(new Error('mongo down'));
        const result = await NotificationService.notify({
            userIds: ['507f1f77bcf86cd799439011'],
            type: 'message',
            title: 't',
            message: 'm',
        });
        expect(result.error).toContain('mongo down');
    });
});

describe('type registry', () => {
    test('every type the triggers emit is a declared schema type', () => {
        // If a trigger invents a type, Notification.create would throw a
        // ValidationError at runtime. Catch that here instead.
        const emitted = new Set();
        const original = NotificationService.notify;
        const seen = [];
        jest.spyOn(NotificationService, 'notify').mockImplementation(async (opts) => {
            seen.push(opts.type);
            return { created: 1 };
        });

        triggers.notifyNewMessage({
            message: { sender: { _id: 'u1', fullName: 'Ada' }, content: 'hi', company: 'c1', channel: 'ch1' },
            channel: { _id: 'ch1', name: 'general', members: [{ user: 'u2' }] },
        });
        triggers.notifyStandupPosted({
            standup: { _id: 's1', today: 'ship', company: 'c1', channel: 'ch1' },
            channel: { _id: 'ch1', name: 'general', members: [{ user: 'u2' }] },
            author: { _id: 'u1', fullName: 'Ada' },
        });
        triggers.notifyTaskAssigned({ task: { _id: 't1', title: 'Fix' }, assigneeId: 'u2', assigner: { _id: 'u1' } });
        triggers.notifyTaskStatusChanged({ task: { _id: 't1' }, status: 'done', actor: { _id: 'u1' }, assigneeId: 'u2' });
        triggers.notifySpecEvent({ type: 'spec_verified', spec: { _id: 'sp1' }, ownerId: 'u1' });
        triggers.notifyAgentEvent({ type: 'agent_failed', execution: { _id: 'e1' }, userId: 'u1' });
        triggers.notifyMeetingEvent({ type: 'meeting_scheduled', meeting: { _id: 'm1' }, userIds: ['u2'] });
        triggers.notifyDeploymentEvent({ type: 'deployment_succeeded', deployment: { _id: 'd1' }, userId: 'u1' });
        triggers.notifyPaymentEvent({ type: 'payment_succeeded', userId: 'u1', detail: 'ok' });
        triggers.notifySubscriptionAlert({ type: 'trial_expiring', userId: 'u1', detail: 'soon' });
        triggers.notifyMemberEvent({ type: 'member_joined', company: { _id: 'c1', name: 'Acme' }, userIds: ['u2'] });
        triggers.notifyProjectCreated({ project: { _id: 'p1' }, userIds: ['u2'], actor: { _id: 'u1' } });
        triggers.notifyChannelCreated({ channel: { _id: 'ch1', name: 'dev' }, userIds: ['u2'], actor: { _id: 'u1' } });

        NotificationService.notify.mockRestore();
        for (const type of seen) {
            expect(NOTIFICATION_TYPES).toContain(type);
            emitted.add(type);
        }
        expect(emitted.size).toBeGreaterThanOrEqual(12);
        expect(original).toBeDefined();
    });

    test('stale integration types are gone', () => {
        // These belonged to an abandoned integration plan; keeping them in the
        // enum would imply a trigger exists for each one.
        for (const stale of ['github_commit', 'discord_message', 'slack_dm', 'figma_comment', 'notion_page_updated']) {
            expect(NOTIFICATION_TYPES).not.toContain(stale);
        }
    });
});

describe('mention routing', () => {
    test('mentioned members get a high-priority entry, others a quiet one', async () => {
        const notify = jest.spyOn(NotificationService, 'notify').mockResolvedValue({ created: 1 });

        triggers.notifyNewMessage({
            message: {
                _id: 'm1',
                sender: { _id: 'u1', fullName: 'Ada' },
                content: 'hey @bob look',
                company: 'c1',
                channel: 'ch1',
            },
            channel: { _id: 'ch1', name: 'general', members: [{ user: 'u2' }, { user: 'u3' }] },
            mentions: ['u2'],
        });
        await flush();

        expect(notify).toHaveBeenCalledTimes(2);
        const [mentionCall, otherCall] = notify.mock.calls.map((c) => c[0]);
        expect(mentionCall.type).toBe('mention');
        expect(mentionCall.priority).toBe('high');
        expect(mentionCall.userIds).toEqual(['u2']);
        // The rest of the channel is not turned into high-priority noise.
        expect(otherCall.type).toBe('message');
        expect(otherCall.priority).toBe('low');
        expect(otherCall.userIds).toEqual(['u3']);
        notify.mockRestore();
    });

    test('a direct message notifies only the recipient', async () => {
        const notify = jest.spyOn(NotificationService, 'notify').mockResolvedValue({ created: 1 });

        triggers.notifyNewMessage({
            message: { _id: 'm1', sender: { _id: 'u1', fullName: 'Ada' }, content: 'psst', company: 'c1' },
            channel: null,
            recipientId: 'u9',
        });
        await flush();

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].type).toBe('direct_message');
        expect(notify.mock.calls[0][0].userIds).toEqual(['u9']);
        notify.mockRestore();
    });
});

describe('triggers never reject', () => {
    test('a broken service does not produce an unhandled rejection', async () => {
        const spy = jest.spyOn(NotificationService, 'notify').mockRejectedValue(new Error('boom'));
        const unhandled = [];
        const onUnhandled = (reason) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);

        triggers.notifyTaskAssigned({ task: { _id: 't1', title: 'x' }, assigneeId: 'u2', assigner: { _id: 'u1' } });
        triggers.notifyPaymentEvent({ type: 'payment_succeeded', userId: 'u1', detail: 'paid' });
        await new Promise((r) => setTimeout(r, 30));

        process.off('unhandledRejection', onUnhandled);
        spy.mockRestore();
        expect(unhandled).toHaveLength(0);
    });
});

describe('trigger wiring in routes', () => {
    const fs = require('fs');
    const path = require('path');
    const src = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

    test.each([
        ['routes/messaging.js', 'notifyNewMessage', 'channel message'],
        ['routes/messaging.js', 'notifyChannelCreated', 'channel creation'],
        ['routes/standup.js', 'notifyStandupPosted', 'standup post'],
        ['routes/collaboration.js', 'notifyTaskAssigned', 'task assignment'],
        ['routes/meetings.js', 'notifyMeetingEvent', 'meeting scheduled'],
        ['utils/agentSocket.js', 'notifyAgentEvent', 'agent run outcome'],
        ['routes/deployments.js', 'notifyDeploymentEvent', 'deployment outcome'],
        ['routes/paystack-billing.js', 'notifyPaymentEvent', 'payment outcome'],
    ])('%s wires %s (%s)', (file, fn) => {
        // A trigger helper nobody calls is exactly how the previous system ended
        // up with a model, a service and a route but zero notifications.
        expect(src(file)).toContain(`${fn}(`);
    });

    test('every route that notifies imports its trigger', () => {
        for (const file of [
            'routes/messaging.js',
            'routes/standup.js',
            'routes/collaboration.js',
            'routes/meetings.js',
            'routes/deployments.js',
            'routes/paystack-billing.js',
            'utils/agentSocket.js',
        ]) {
            expect(src(file)).toMatch(/require\('\.\.?\/.*notificationTriggers'\)/);
        }
    });
});
