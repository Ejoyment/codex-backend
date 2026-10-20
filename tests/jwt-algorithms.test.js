/**
 * JWT verification must pin the signing algorithm. Without an explicit
 * `algorithms` list, jsonwebtoken accepts any algorithm the key type can
 * verify — a token signed with HS512 (same secret) passes verification even
 * though the app only ever mints HS256 tokens. Pinning removes algorithm
 * confusion from the trust boundary (audit finding: JWT algorithms not pinned).
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

jest.mock('../models/User', () => ({
    exists: jest.fn(async () => ({ _id: 'user-1' }))
}));

const { authenticateToken } = require('../middleware/auth');
const { createStateToken, verifyStateToken } = require('../utils/oauthState');

const SECRET = process.env.JWT_SECRET;

function mockRes() {
    const res = {};
    res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
    });
    res.json = jest.fn(() => res);
    return res;
}

describe('authenticateToken algorithm pinning', () => {
    test('rejects an HS512 token signed with the same secret', async () => {
        const token = jwt.sign({ userId: 'user-1' }, SECRET, { algorithm: 'HS512' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    test('still accepts a normal HS256 token', async () => {
        const token = jwt.sign({ userId: 'user-1' }, SECRET, { algorithm: 'HS256' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.userId).toBe('user-1');
    });
});

describe('OAuth state token algorithm pinning', () => {
    test('round-trips its own HS256 state token', () => {
        const token = createStateToken('user-42');

        expect(verifyStateToken(token)).toBe('user-42');
    });

    test('rejects an HS512 state token signed with the same secret', () => {
        const token = jwt.sign(
            { userId: 'user-42', purpose: 'oauth_state' },
            SECRET,
            { algorithm: 'HS512' }
        );

        expect(() => verifyStateToken(token)).toThrow();
    });
});

describe('source guard', () => {
    const ROOT = path.join(__dirname, '..');
    const ROOTS = ['routes', 'middleware', 'utils', 'config', 'services', 'models']
        .map((dir) => path.join(ROOT, dir))
        .filter((dir) => fs.existsSync(dir));

    function collectJsFiles(dir) {
        const out = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) out.push(...collectJsFiles(full));
            else if (entry.name.endsWith('.js')) out.push(full);
        }
        return out;
    }

    test('every jwt.verify call pins algorithms to HS256', () => {
        const files = [...ROOTS.flatMap(collectJsFiles), path.join(ROOT, 'server.js')];
        const offenders = [];

        for (const file of files) {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, index) => {
                if (!/jwt\.verify\(/.test(line)) return;
                if (!/algorithms\s*:\s*\[\s*'HS256'\s*\]/.test(line)) {
                    offenders.push(`${path.relative(ROOT, file)}:${index + 1}`);
                }
            });
        }

        expect(offenders).toEqual([]);
    });
});
