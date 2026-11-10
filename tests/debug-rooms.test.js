/**
 * Debug Room API contract.
 *
 * The Debug Room page keeps a persistent shared context (branch/file,
 * investigation, chat, participants and invites). These tests pin the access
 * model: hosts and invited collaborators can edit, company members can view /
 * join as viewers, and everyone else gets a 403.
 */
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

let currentUser = 'host-1';

jest.doMock('../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.userId = currentUser;
        next();
    },
}));

const users = {
    'host-1': { fullName: 'Sarah Chen', email: 'sarah@example.com' },
    'viewer-1': { fullName: 'Alex Morgan', email: 'alex@example.com' },
    'collab-1': { fullName: 'Marcus Webb', email: 'marcus@example.com' },
    'outsider-1': { fullName: 'Outsider', email: 'outsider@example.com' },
};

jest.doMock('../models/User', () => ({
    findById: (id) => ({
        select: () => ({
            lean: async () => users[id] || null,
        }),
    }),
}));

jest.doMock('../models/Company', () => ({
    find: () => ({
        select: () => ({
            lean: async () => (currentUser === 'outsider-1' ? [] : [{ _id: 'company-1' }]),
        }),
    }),
}));

const codeFile = {
    _id: 'file-1',
    name: 'jwt.service.ts',
    path: '/src/services/auth',
    language: 'typescript',
    content: 'import { tokenStore } from "./token-store"\nconst stored = await tokenStore.find(token)\nthrow new TokenExpiredError("invalid")',
};

function queryOf(data) {
    const promise = Promise.resolve(data);
    promise.select = () => promise;
    promise.sort = () => promise;
    promise.limit = () => promise;
    promise.lean = () => Promise.resolve(data);
    return promise;
}

jest.doMock('../models/CodeFile', () => {
    class MockCodeFile {
        static find() {
            return queryOf([codeFile]);
        }

        static fullPathFor(file) {
            const base = String(file.path || '/').replace(/\/+$/, '');
            return `${base}/${file.name}`.replace(/\/+/g, '/');
        }
    }
    return MockCodeFile;
});

const savedRooms = [];
let roomCounter = 0;

jest.doMock('../models/DebugRoom', () => {
    class MockDebugRoom {
        constructor(data) {
            Object.assign(this, data);
            this._id = data._id || `room-${roomCounter += 1}`;
            this.createdAt = data.createdAt || new Date();
            this.updatedAt = data.updatedAt || new Date();
            this.lastActiveAt = data.lastActiveAt || new Date();
            this.participants = data.participants || [];
            this.invites = data.invites || [];
            this.chat = data.chat || [];
            this.activity = data.activity || [];
            this.investigation = data.investigation || {};
            this.context = data.context || {};
        }

        async save() {
            if (!savedRooms.includes(this)) savedRooms.push(this);
            return this;
        }

        static find() {
            return queryOf(savedRooms);
        }

        static findById(id) {
            return Promise.resolve(savedRooms.find((room) => String(room._id) === String(id)) || null);
        }

        static findOne(query) {
            return Promise.resolve(savedRooms.find((room) => room.roomId === query.roomId) || null);
        }

        static exists(query) {
            return Promise.resolve(savedRooms.some((room) => room.roomId === query.roomId));
        }
    }
    return MockDebugRoom;
});

const debugRoomsRouter = require('../routes/debug-rooms');

const app = express();
app.use(express.json());
app.use('/api/debug-rooms', debugRoomsRouter);

function seedRoom(overrides = {}) {
    const room = {
        _id: `64b00000000000000000${String(roomCounter += 1).padStart(4, '0')}`,
        roomId: 'auth-flow-debug',
        name: 'auth-flow-debug',
        description: 'Debugging JWT refresh token edge case on mobile Safari',
        repository: 'acme/horizon-web',
        branch: 'feature/auth-flow-redesign',
        openFile: 'src/services/auth/jwt.service.ts',
        activeLine: 12,
        status: 'active',
        host: 'host-1',
        createdBy: 'host-1',
        companyId: 'company-1',
        participants: [{
            userId: 'host-1',
            name: 'Sarah Chen',
            role: 'host',
            activeLine: 12,
            joinedAt: new Date(),
            lastSeenAt: new Date(),
        }],
        invites: [{
            _id: 'invite-1',
            email: 'marcus@example.com',
            role: 'collaborator',
            status: 'pending',
            invitedAt: new Date(),
        }],
        investigation: {
            problem: 'Refresh rotation rejects a valid token',
            reproduction: 'Two requests hit refresh together',
            workingTheory: 'The first request revokes before the second',
            nextStep: 'Share the in-flight rotation promise',
        },
        context: {
            task: { title: 'OAuth2 + JWT auth flow redesign', status: 'In Progress', href: '/tasks' },
            pullRequest: { title: '', status: '', href: '' },
            branch: { title: 'feature/auth-flow-redesign', status: 'Active', href: '/source-code' },
            specification: { title: 'auth-security.spec.yaml', status: '8/9 requirements passing', href: '/specs' },
        },
        chat: [],
        activity: [],
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        async save() {
            if (!savedRooms.includes(this)) savedRooms.push(this);
            return this;
        },
        ...overrides,
    };
    savedRooms.push(room);
    return room;
}

beforeEach(() => {
    savedRooms.length = 0;
    roomCounter = 0;
    currentUser = 'host-1';
});

describe('Debug Room creation', () => {
    test('creates a room with the host participant and email invites', async () => {
        const res = await request(app)
            .post('/api/debug-rooms')
            .send({
                name: 'auth-refresh-debug',
                description: 'Refresh tokens race after Safari resumes',
                branch: 'feature/auth-flow-redesign',
                openFile: 'src/services/auth/jwt.service.ts',
                emails: 'one@example.com, two@example.com',
                participantAccess: 'collaborator',
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.room.roomId).toBe('auth-refresh-debug');
        expect(res.body.room.participants[0]).toMatchObject({ role: 'host', name: 'Sarah Chen' });
        expect(res.body.room.invites).toHaveLength(2);
        expect(res.body.room.invites[0]).toMatchObject({ role: 'collaborator', status: 'pending' });
        expect(res.body.room.access).toMatchObject({ role: 'host', canEdit: true, joined: true });
    });

    test('rejects invalid room names and missing branches', async () => {
        const invalidName = await request(app)
            .post('/api/debug-rooms')
            .send({ name: 'Auth Flow Debug', description: 'Body', branch: 'feature/x' });
        expect(invalidName.status).toBe(400);

        const missingBranch = await request(app)
            .post('/api/debug-rooms')
            .send({ name: 'auth-flow', description: 'Body' });
        expect(missingBranch.status).toBe(400);
    });
});

describe('Debug Room access', () => {
    test('company members can list the room as viewers without seeing invites', async () => {
        seedRoom();
        currentUser = 'viewer-1';

        const res = await request(app).get('/api/debug-rooms');

        expect(res.status).toBe(200);
        expect(res.body.rooms).toHaveLength(1);
        expect(res.body.rooms[0].access).toMatchObject({ role: 'viewer', canEdit: false, canInvite: false, joined: false });
        expect(res.body.rooms[0].invites).toEqual([]);
    });

    test('users outside the company get no rooms and cannot open a room', async () => {
        seedRoom();
        currentUser = 'outsider-1';

        const list = await request(app).get('/api/debug-rooms');
        expect(list.status).toBe(200);
        expect(list.body.rooms).toEqual([]);

        const detail = await request(app).get('/api/debug-rooms/auth-flow-debug');
        expect(detail.status).toBe(403);
    });

    test('viewers cannot edit the investigation but collaborators can', async () => {
        seedRoom();
        currentUser = 'viewer-1';
        const denied = await request(app)
            .patch('/api/debug-rooms/auth-flow-debug')
            .send({ investigation: { problem: 'Changed' } });
        expect(denied.status).toBe(403);

        currentUser = 'host-1';
        const allowed = await request(app)
            .patch('/api/debug-rooms/auth-flow-debug')
            .send({ investigation: { problem: 'Changed', nextStep: 'Ship the promise cache' } });
        expect(allowed.status).toBe(200);
        expect(allowed.body.room.investigation.problem).toBe('Changed');
        expect(allowed.body.room.investigation.nextStep).toBe('Ship the promise cache');
    });

    test('an invited collaborator joins directly with edit access', async () => {
        seedRoom();
        currentUser = 'collab-1';

        const res = await request(app).post('/api/debug-rooms/auth-flow-debug/join').send({});

        expect(res.status).toBe(200);
        expect(res.body.room.access).toMatchObject({ role: 'collaborator', canEdit: true, joined: true });
        expect(res.body.room.participants).toHaveLength(2);
    });
});

describe('Debug Room collaboration', () => {
    test('a viewer can join, chat, and leave the room', async () => {
        seedRoom();
        currentUser = 'viewer-1';

        const joined = await request(app).post('/api/debug-rooms/auth-flow-debug/join').send({ role: 'viewer' });
        expect(joined.status).toBe(200);
        expect(joined.body.room.access).toMatchObject({ role: 'viewer', joined: true });

        const chat = await request(app)
            .post('/api/debug-rooms/auth-flow-debug/chat')
            .send({ message: 'I can reproduce this on Safari.' });
        expect(chat.status).toBe(200);
        expect(chat.body.room.chat.at(-1)).toMatchObject({ name: 'Alex Morgan', message: 'I can reproduce this on Safari.' });

        const left = await request(app).post('/api/debug-rooms/auth-flow-debug/leave').send({});
        expect(left.status).toBe(200);
        expect(left.body.room.access.joined).toBe(false);
        expect(left.body.room.participants).toHaveLength(1);
    });

    test('only collaborators can invite new members', async () => {
        seedRoom();
        currentUser = 'viewer-1';
        const denied = await request(app)
            .post('/api/debug-rooms/auth-flow-debug/invite')
            .send({ emails: 'new@example.com', role: 'viewer' });
        expect(denied.status).toBe(403);

        currentUser = 'host-1';
        const allowed = await request(app)
            .post('/api/debug-rooms/auth-flow-debug/invite')
            .send({ emails: 'new@example.com, second@example.com', role: 'collaborator' });
        expect(allowed.status).toBe(200);
        expect(allowed.body.invited).toEqual(['new@example.com', 'second@example.com']);
        expect(allowed.body.room.invites).toHaveLength(3);
    });

    test('loads the shared file snapshot and participant line highlights', async () => {
        seedRoom();
        currentUser = 'host-1';

        const res = await request(app).get('/api/debug-rooms/auth-flow-debug/code');

        expect(res.status).toBe(200);
        expect(res.body.code.file).toMatchObject({
            name: 'jwt.service.ts',
            path: 'src/services/auth/jwt.service.ts',
            language: 'typescript',
        });
        expect(res.body.code.activeLine).toBe(12);
        expect(res.body.code.highlights).toEqual([
            expect.objectContaining({ line: 12, name: 'Sarah Chen', role: 'host' }),
        ]);
    });
});
