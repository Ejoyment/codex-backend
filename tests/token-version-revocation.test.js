/**
 * E11 — JWT revocation via User.tokenVersion.
 *
 * Covers issuance (password + OTP login), REST/socket verification (including
 * legacy tokens that predate the claim), and the three revocation triggers:
 * password change, logout-all, and admin ban.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-token-version-32chars';
process.env.ADMIN_API_KEY = 'admin-test-key';

jest.mock('../models/User', () => ({
    db: { readyState: 1 },
    exists: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn()
}));

jest.mock('../models/AuthLockout', () => ({
    isLockedOut: jest.fn(async () => false),
    recordFailure: jest.fn(async () => {}),
    clearLockout: jest.fn(async () => {})
}));

jest.mock('../models/OTP', () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn()
}));

jest.mock('../middleware/trial', () => ({
    getOrCreateSubscription: jest.fn(async () => ({
        tier: 'pro',
        status: 'active',
        trialEndsAt: null,
        getTrialDaysLeft: () => 0
    })),
    createTrialSubscription: jest.fn()
}));

jest.mock('../utils/emailServiceResend', () => ({
    sendOTPEmail: jest.fn(async () => ({ success: true })),
    sendWelcomeEmail: jest.fn(async () => {}),
    sendTrialWelcomeEmail: jest.fn(async () => {}),
    sendTrialExpiredEmail: jest.fn(async () => {}),
    sendTrialReminderEmail: jest.fn(async () => {})
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const OTP = require('../models/OTP');
const authRouter = require('../routes/auth');
const adminRouter = require('../routes/admin');
const otpRouter = require('../routes/otp');
const { authenticateToken, clearLivenessCache } = require('../middleware/auth');
const { resolveSocketUser, assertSocketUserLive } = require('../utils/socketAuth');

const USER_ID = '507f1f77bcf86cd799439011';

const protectedApp = express();
protectedApp.get('/protected', authenticateToken, (req, res) => {
    res.json({ success: true, userId: req.userId });
});

const authApp = express();
authApp.use(express.json());
authApp.use('/api/auth', authRouter);

const adminApp = express();
adminApp.use(express.json());
adminApp.use('/api/admin', adminRouter);

const otpApp = express();
otpApp.use(express.json());
otpApp.use('/api/otp', otpRouter);

let userDoc;

function queryFor(doc) {
    const query = {
        select() {
            return query;
        },
        lean: async () => ({ _id: doc._id, tokenVersion: doc.tokenVersion }),
        then(resolve, reject) {
            return Promise.resolve(doc).then(resolve, reject);
        },
        catch(reject) {
            return Promise.resolve(doc).catch(reject);
        }
    };
    return query;
}

function signToken(tokenVersion, extra = {}) {
    const payload = { userId: USER_ID, ...extra };
    if (tokenVersion !== undefined) payload.tokenVersion = tokenVersion;
    return jwt.sign(payload, process.env.JWT_SECRET);
}

function decodeToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

beforeEach(() => {
    jest.clearAllMocks();
    clearLivenessCache();

    userDoc = {
        _id: USER_ID,
        email: 'user@example.com',
        fullName: 'Test User',
        authProvider: 'local',
        isVerified: true,
        tokenVersion: 0,
        password: 'hashed',
        comparePassword: jest.fn(async (candidate) => candidate === 'current-password'),
        save: jest.fn(async function () { return this; })
    };

    User.exists.mockResolvedValue({ _id: USER_ID });
    User.findById.mockImplementation(() => queryFor(userDoc));
    User.findOne.mockResolvedValue(userDoc);
});

describe('User model', () => {
    test('tokenVersion defaults to 0', () => {
        const ActualUser = jest.requireActual('../models/User');
        const user = new ActualUser({
            fullName: 'New User',
            email: 'new@example.com',
            password: 'password123'
        });

        expect(user.tokenVersion).toBe(0);
    });
});

describe('authenticateToken tokenVersion enforcement', () => {
    test('accepts a token whose version matches the account', async () => {
        userDoc.tokenVersion = 3;
        const res = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(3)}`);

        expect(res.status).toBe(200);
        expect(res.body.userId).toBe(USER_ID);
    });

    test('accepts a legacy token with no version when the account version is 0', async () => {
        userDoc.tokenVersion = 0;
        const res = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(undefined)}`);

        expect(res.status).toBe(200);
    });

    test('rejects a legacy token with no version once the account version is bumped', async () => {
        userDoc.tokenVersion = 2;
        const res = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(undefined)}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/revoked/i);
    });

    test('rejects a stale token version', async () => {
        userDoc.tokenVersion = 5;
        const res = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(4)}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/revoked/i);
    });

    test('re-reads the account when cache is stale so a freshly minted token still works', async () => {
        userDoc.tokenVersion = 1;
        const first = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(1)}`);
        expect(first.status).toBe(200);

        // Another process bumps the version and mints a token with it; this
        // process still has the old cached value.
        userDoc.tokenVersion = 2;
        const fresh = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${signToken(2)}`);

        expect(fresh.status).toBe(200);
    });
});

describe('socket auth tokenVersion enforcement', () => {
    test('rejects a socket whose token version is stale', async () => {
        userDoc.tokenVersion = 4;
        const socket = { handshake: { auth: { token: signToken(3) } } };

        await expect(resolveSocketUser(socket)).rejects.toThrow(/revoked/i);
    });

    test('accepts a socket with the current version', async () => {
        userDoc.tokenVersion = 4;
        const socket = { handshake: { auth: { token: signToken(4) } } };

        await expect(resolveSocketUser(socket)).resolves.toMatchObject({ userId: USER_ID });
    });

    test('accepts a legacy socket token when the account version is 0', async () => {
        userDoc.tokenVersion = 0;
        await expect(assertSocketUserLive(USER_ID, undefined)).resolves.toBeUndefined();
    });
});

describe('issued tokens carry the current tokenVersion', () => {
    test('password signin includes tokenVersion', async () => {
        userDoc.tokenVersion = 6;
        const res = await request(authApp)
            .post('/api/auth/signin')
            .send({ email: userDoc.email, password: 'current-password' });

        expect(res.status).toBe(200);
        expect(decodeToken(res.body.token).tokenVersion).toBe(6);
    });

    test('OTP verification includes tokenVersion', async () => {
        userDoc.tokenVersion = 7;
        OTP.findOne.mockReturnValue({
            sort: async () => ({
                otp: otpRouter.hashOTP('123456'),
                createdAt: new Date(),
                attempts: 0,
                verified: false,
                save: jest.fn(async function () { return this; })
            })
        });
        OTP.deleteOne.mockResolvedValue({});

        const res = await request(otpApp)
            .post('/api/otp/verify')
            .send({ email: userDoc.email, otp: '123456' });

        expect(res.status).toBe(200);
        expect(decodeToken(res.body.token).tokenVersion).toBe(7);
    });
});

describe('revocation triggers', () => {
    test('password change bumps tokenVersion and invalidates the old token', async () => {
        userDoc.tokenVersion = 2;
        const oldToken = signToken(2);

        const res = await request(authApp)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${oldToken}`)
            .send({ currentPassword: 'current-password', newPassword: 'new-password-123' });

        expect(res.status).toBe(200);
        expect(userDoc.tokenVersion).toBe(3);
        expect(userDoc.save).toHaveBeenCalled();

        const replay = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${oldToken}`);
        expect(replay.status).toBe(403);
    });

    test('logout-all bumps tokenVersion and invalidates every session', async () => {
        userDoc.tokenVersion = 8;
        const token = signToken(8);

        const res = await request(authApp)
            .post('/api/auth/logout-all')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(userDoc.tokenVersion).toBe(9);

        const replay = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);
        expect(replay.status).toBe(403);
    });

    test('admin ban bumps tokenVersion and invalidates the banned user', async () => {
        userDoc.tokenVersion = 1;
        const token = signToken(1);

        const res = await request(adminApp)
            .post(`/api/admin/users/${USER_ID}/ban`)
            .set('x-admin-key', process.env.ADMIN_API_KEY)
            .send({ reason: 'test' });

        expect(res.status).toBe(200);
        expect(userDoc.isBanned).toBe(true);
        expect(userDoc.tokenVersion).toBe(2);

        const replay = await request(protectedApp)
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);
        expect(replay.status).toBe(403);
    });
});
