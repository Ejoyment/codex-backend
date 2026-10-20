/**
 * Support agent lifecycle (audit 2026-10-19, finding #7).
 *
 * SupportAgent had no lifecycle: a deactivated/removed agent kept a valid
 * 8h JWT, login never checked an active flag (none existed), and /agent/login
 * had only the IP limiter — which fails open when its store is unreachable.
 * These tests pin:
 *  A. isActive:false rejects login even with the correct password.
 *  B. isActive:false rejects a still-valid agent token on protected routes.
 *  C. 5 failed logins arm a per-account lockout; the next attempt is 429
 *     before any credential lookup happens (DB never touched).
 *  D. successful login clears the lockout record.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

// In-memory AuthLockout so the lockout semantics are tested without a DB.
const lockouts = new Map();
jest.doMock('../models/AuthLockout', () => {
    const MAX_FAILURES = 5;
    const LOCKOUT_MS = 30 * 60 * 1000;
    return {
        MAX_FAILURES,
        LOCKOUT_MS,
        isLockedOut: async (key) => {
            const rec = lockouts.get(String(key).toLowerCase());
            if (!rec || !rec.lockedUntil) return false;
            if (Date.now() > rec.lockedUntil) {
                lockouts.delete(String(key).toLowerCase());
                return false;
            }
            return true;
        },
        recordFailure: async (key) => {
            const k = String(key).toLowerCase();
            const rec = lockouts.get(k) || { failures: 0, lockedUntil: null };
            rec.failures += 1;
            if (rec.failures >= MAX_FAILURES && !rec.lockedUntil) {
                rec.lockedUntil = Date.now() + LOCKOUT_MS;
            }
            lockouts.set(k, rec);
            return { locked: !!rec.lockedUntil && Date.now() < rec.lockedUntil };
        },
        clearLockout: async (key) => lockouts.delete(String(key).toLowerCase()),
    };
});

// The inline login limiter counts from all suite requests from one IP; disable
// it so the lockout assertions test the lockout, not the limiter.
jest.doMock('express-rate-limit', () => () => (req, res, next) => next());

const SupportAgent = require('../models/SupportAgent');
const supportRouter = require('../routes/support');

const app = express();
app.use(express.json());
app.use('/api/support', supportRouter);

beforeEach(() => {
    lockouts.clear();
    jest.restoreAllMocks();
});

const mockAgent = (overrides = {}) => ({
    _id: '507f1f77bcf86cd799439011',
    name: 'Ada',
    email: 'ada@example.com',
    role: 'agent',
    status: 'offline',
    isActive: true,
    comparePassword: jest.fn().mockResolvedValue(true),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
});

const login = (password) =>
    request(app).post('/api/support/agent/login').send({ email: 'ada@example.com', password });

describe('support agent login lifecycle', () => {
    test('deactivated agent cannot log in even with the correct password', async () => {
        const agent = mockAgent({ isActive: false });
        jest.spyOn(SupportAgent, 'findOne').mockResolvedValue(agent);

        const res = await login('correct-password');

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
        expect(agent.comparePassword).not.toHaveBeenCalled();
    });

    test('active agent with the correct password logs in', async () => {
        jest.spyOn(SupportAgent, 'findOne').mockResolvedValue(mockAgent());

        const res = await login('correct-password');

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(lockouts.size).toBe(0);
    });

    test('five failures arm a lockout; the sixth attempt is 429 without a DB lookup', async () => {
        const findOne = jest
            .spyOn(SupportAgent, 'findOne')
            .mockResolvedValue(mockAgent({ comparePassword: jest.fn().mockResolvedValue(false) }));

        for (let i = 0; i < 5; i++) {
            const res = await login('wrong-password');
            expect(res.status).toBe(401);
        }

        findOne.mockClear();
        const res = await login('wrong-password');

        expect(res.status).toBe(429);
        expect(findOne).not.toHaveBeenCalled();
        expect(lockouts.get('support-agent:ada@example.com').failures).toBe(5);
    });

    test('an expired lockout does not block, and success clears the record', async () => {
        lockouts.set('support-agent:ada@example.com', { failures: 5, lockedUntil: Date.now() - 1000 });
        jest.spyOn(SupportAgent, 'findOne').mockResolvedValue(mockAgent());

        const res = await login('correct-password');

        expect(res.status).toBe(200);
        expect(lockouts.has('support-agent:ada@example.com')).toBe(false);
    });
});

describe('support agent token lifecycle', () => {
    const sign = (agentId) => jwt.sign({ agentId, role: 'agent' }, process.env.JWT_SECRET);

    test('a still-valid token for a deactivated agent is rejected', async () => {
        jest.spyOn(SupportAgent, 'findById').mockResolvedValue(mockAgent({ isActive: false }));

        const res = await request(app)
            .get('/api/support/agent/stats')
            .set('Authorization', `Bearer ${sign('507f1f77bcf86cd799439011')}`);

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid token/i);
    });

    test('a token for a deleted agent is rejected', async () => {
        jest.spyOn(SupportAgent, 'findById').mockResolvedValue(null);

        const res = await request(app)
            .get('/api/support/agent/stats')
            .set('Authorization', `Bearer ${sign('507f1f77bcf86cd799439011')}`);

        expect(res.status).toBe(401);
    });

    test('an active agent passes the token gate', async () => {
        jest.spyOn(SupportAgent, 'findById').mockResolvedValue(mockAgent());

        const res = await request(app)
            .post('/api/support/agent/logout')
            .set('Authorization', `Bearer ${sign('507f1f77bcf86cd799439011')}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/logged out/i);
    });
});
