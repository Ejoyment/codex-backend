jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ destroy: jest.fn() })) }));
jest.mock('../utils/paystackScheduler', () => ({ processScheduledCharges: jest.fn() }));
jest.mock('../utils/billingScheduler', () => ({
    processDueCharges: jest.fn(),
    processScheduledCharges: jest.fn()
}));
jest.mock('../utils/flutterwaveScheduler', () => ({ processScheduledCharges: jest.fn() }));
jest.mock('../utils/emailServiceResend', () => ({
    sendTrialExpiredEmail: jest.fn(async () => {}),
    sendTrialReminderEmail: jest.fn(async () => {})
}));

const BillingCron = require('../utils/billingCron');
const Subscription = require('../models/Subscription');
const emailService = require('../utils/emailServiceResend');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

let findSpy;
let populateMock;
let sortMock;
let limitMock;

function makeSubscription(overrides = {}) {
    return {
        _id: 'sub-1',
        userId: {
            email: 'trial@example.com',
            fullName: 'Trial User'
        },
        status: 'trial',
        metadata: {},
        daysLeft: 3,
        expired: false,
        getTrialDaysLeft: jest.fn(function () {
            return this.daysLeft;
        }),
        isTrialExpired: jest.fn(function () {
            return this.expired;
        }),
        upgradeTo: jest.fn(),
        save: jest.fn(async () => {}),
        ...overrides
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    limitMock = jest.fn().mockResolvedValue([]);
    sortMock = jest.fn(() => ({ limit: limitMock }));
    populateMock = jest.fn(() => ({ sort: sortMock }));
    findSpy = jest.spyOn(Subscription, 'find').mockReturnValue({ populate: populateMock });
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('checkTrialLifecycle scan is bounded', () => {
    test('only fetches trials inside the 3-day reminder window, sorted, with a batch cap', async () => {
        const before = Date.now();
        await BillingCron.checkTrialLifecycle();

        const filter = findSpy.mock.calls[0][0];
        expect(filter.status).toBe('trial');
        expect(filter.trialEndsAt).toBeDefined();

        const cutoff = filter.trialEndsAt.$lte.getTime();
        expect(cutoff).toBeGreaterThanOrEqual(before + THREE_DAYS_MS - 5000);
        expect(cutoff).toBeLessThanOrEqual(Date.now() + THREE_DAYS_MS + 5000);

        expect(sortMock).toHaveBeenCalledWith({ trialEndsAt: 1 });
        expect(limitMock).toHaveBeenCalledWith(200);
        expect(populateMock).toHaveBeenCalledWith('userId', 'email fullName');
    });

    test('warns when the batch cap is saturated so leftovers are not silent', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const rows = Array.from({ length: 200 }, (_, i) =>
            makeSubscription({ _id: `sub-${i}`, metadata: { trialReminder_3: true } })
        );
        limitMock.mockResolvedValue(rows);

        await BillingCron.checkTrialLifecycle();

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('200-row batch cap')
        );
    });
});

describe('checkTrialLifecycle behaviour is unchanged', () => {
    test('expires and downgrades an expired trial', async () => {
        const sub = makeSubscription({ expired: true, daysLeft: 0 });
        limitMock.mockResolvedValue([sub]);

        await BillingCron.checkTrialLifecycle();

        expect(sub.status).toBe('expired');
        expect(sub.upgradeTo).toHaveBeenCalledWith('developer');
        expect(sub.save).toHaveBeenCalled();
        expect(emailService.sendTrialExpiredEmail).toHaveBeenCalledWith(
            'trial@example.com',
            'Trial User'
        );
    });

    test('sends a reminder once and records it in metadata', async () => {
        const sub = makeSubscription({ daysLeft: 2 });
        limitMock.mockResolvedValue([sub]);

        await BillingCron.checkTrialLifecycle();

        expect(emailService.sendTrialReminderEmail).toHaveBeenCalledWith(
            'trial@example.com',
            'Trial User',
            2
        );
        expect(sub.metadata).toEqual({ trialReminder_2: true });
        expect(sub.save).toHaveBeenCalled();
    });

    test('does not resend a reminder already recorded in metadata', async () => {
        const sub = makeSubscription({ daysLeft: 2, metadata: { trialReminder_2: true } });
        limitMock.mockResolvedValue([sub]);

        await BillingCron.checkTrialLifecycle();

        expect(emailService.sendTrialReminderEmail).not.toHaveBeenCalled();
        expect(sub.save).not.toHaveBeenCalled();
    });
});
