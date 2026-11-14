/**
 * Tenant-isolation negative tests for routes/debug.js (audit rec 7).
 *
 * Debug sessions drive live processes and expose memory/variables, and
 * session IDs are guessable (debug_<counter>_<timestamp>) — so every
 * sessionId must belong to the caller. No database: models and the adapter
 * backend are mocked; auth uses a real signed JWT.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/CodeFile', () => ({ findById: jest.fn(), findOne: jest.fn(), findByIdAndDelete: jest.fn(async () => null) }));
jest.mock('../models/Company', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../utils/personalWorkspace', () => ({
  findPersonalWorkspace: jest.fn(async () => null),
  findPersonalWorkspaceById: jest.fn(async () => null),
  ensurePersonalWorkspace: jest.fn(async () => null),
}));
jest.mock('../middleware/trial', () => ({
  getOrCreateSubscription: jest.fn(async () => ({ tier: 'pro' })),
}));
jest.mock('../utils/debugAdapter', () => {
  const sessions = new Map();
  const ok = (ret) => jest.fn(async () => ret);
  return {
    sessions,
    getOwnedSession: jest.fn((id, uid) => {
      const s = sessions.get(id);
      return s && String(s.userId) === String(uid) ? s : null;
    }),
    getSession: jest.fn((id) => (sessions.has(id) ? { id, state: 'running' } : null)),
    getUserSessions: jest.fn(() => []),
    hostExecutionAllowed: jest.fn(() => true),
    createSession: jest.fn(async (userId, workspaceId) => {
      const s = { id: `debug_9_${Date.now()}`, userId, workspaceId, state: 'initialized' };
      sessions.set(s.id, s);
      return s;
    }),
    launch: ok({ success: true }),
    setBreakpoints: ok([]),
    continue: ok({ success: true }),
    stepOver: ok({ success: true }),
    stepInto: ok({ success: true }),
    stepOut: ok({ success: true }),
    pause: ok({ success: true }),
    getStackTrace: ok([]),
    getVariables: ok([]),
    evaluate: ok({ result: 1 }),
    terminate: ok({ success: true }),
    simulateBreakpointHit: jest.fn(() => null),
  };
});

const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const User = require('../models/User');
const debugAdapter = require('../utils/debugAdapter');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/debug', require('../routes/debug'));

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
const WORKSPACE_A = '507f1f77bcf86cd799439022';

let currentFile = null;
let currentCompany = null;
function chainable(file) {
  const q = { populate: () => q, then: (resolve) => resolve(file) };
  return q;
}
const fileOfA = () => ({
  _id: 'fileA', name: 'secret.js', path: '/', language: 'javascript',
  content: 'original', company: 'companyA', createdBy: 'userA',
  lastModifiedBy: 'userA', collaborators: [], versions: [],
  save: jest.fn(async function () { return this; }),
  populate: jest.fn(async function () { return this; }),
  toObject: function () { return { ...this }; },
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  User.exists.mockResolvedValue({ _id: 'x' });
  User.findById.mockResolvedValue({ _id: 'userA' });
  currentFile = null;
  currentCompany = null;
  debugAdapter.sessions.clear();
  debugAdapter.sessions.set('sessA', { id: 'sessA', userId: 'userA' });
  CodeFile.findById.mockImplementation(() => chainable(currentFile));
  CodeFile.findOne.mockImplementation(() => chainable(currentFile));
  Company.findOne.mockImplementation(() => ({
    select: () => ({ lean: async () => currentCompany }),
  }));
  Company.findById.mockImplementation(() => ({
    select: () => ({ lean: async () => currentCompany }),
  }));
});

describe('session creation', () => {
  test('create session in foreign workspace → 403', async () => {
    const res = await request(app)
      .post('/api/debug/session/create')
      .set(auth('userB'))
      .send({ workspaceId: WORKSPACE_A, config: {} });
    expect(res.status).toBe(403);
    expect(debugAdapter.createSession).not.toHaveBeenCalled();
  });

  test('create session in own workspace → 200', async () => {
    currentCompany = { _id: WORKSPACE_A, owner: 'userA', members: [] };
    const res = await request(app)
      .post('/api/debug/session/create')
      .set(auth('userA'))
      .send({ workspaceId: WORKSPACE_A, config: {} });
    expect(res.status).toBe(200);
    expect(debugAdapter.createSession).toHaveBeenCalled();
  });
});

describe('session-bound operations', () => {
  test.each([
    ['continue', '/api/debug/continue', 'continue'],
    ['step-over', '/api/debug/step-over', 'stepOver'],
    ['step-into', '/api/debug/step-into', 'stepInto'],
    ['step-out', '/api/debug/step-out', 'stepOut'],
    ['pause', '/api/debug/pause', 'pause'],
    ['terminate', '/api/debug/terminate', 'terminate'],
  ])('%s on foreign session → 403, adapter untouched', async (_label, url, fn) => {
    const res = await request(app).post(url).set(auth('userB')).send({ sessionId: 'sessA' });
    expect(res.status).toBe(403);
    expect(debugAdapter[fn]).not.toHaveBeenCalled();
  });

  test('evaluate in foreign session → 403 (no code exec in another user’s process)', async () => {
    const res = await request(app)
      .post('/api/debug/evaluate')
      .set(auth('userB'))
      .send({ sessionId: 'sessA', expression: 'process.env' });
    expect(res.status).toBe(403);
    expect(debugAdapter.evaluate).not.toHaveBeenCalled();
  });

  test('stack-trace of foreign session → 403', async () => {
    const res = await request(app).get('/api/debug/stack-trace/sessA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(debugAdapter.getStackTrace).not.toHaveBeenCalled();
  });

  test('variables of foreign session → 403', async () => {
    const res = await request(app).get('/api/debug/variables/sessA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(debugAdapter.getVariables).not.toHaveBeenCalled();
  });

  test('session info of foreign session → 403', async () => {
    const res = await request(app).get('/api/debug/session/sessA').set(auth('userB'));
    expect(res.status).toBe(403);
  });

  test('missing session → 404 (not 403)', async () => {
    const res = await request(app).get('/api/debug/session/nope').set(auth('userB'));
    expect(res.status).toBe(404);
  });

  test('breakpoint-hit injection into foreign session → 403', async () => {
    const res = await request(app)
      .post('/api/debug/test/breakpoint-hit')
      .set(auth('userB'))
      .send({ sessionId: 'sessA', fileId: 'f', line: 1 });
    expect(res.status).toBe(403);
    expect(debugAdapter.simulateBreakpointHit).not.toHaveBeenCalled();
  });

  test('own session drives fine → 200', async () => {
    const res = await request(app)
      .post('/api/debug/continue')
      .set(auth('userA'))
      .send({ sessionId: 'sessA' });
    expect(res.status).toBe(200);
    expect(debugAdapter.continue).toHaveBeenCalledWith('sessA');
  });
});

describe('launch (reads + executes file content)', () => {
  test('launch on foreign session → 403 before file is touched', async () => {
    currentFile = fileOfA();
    const res = await request(app)
      .post('/api/debug/launch')
      .set(auth('userB'))
      .send({ sessionId: 'sessA', fileId: 'fileA', language: 'javascript' });
    expect(res.status).toBe(403);
    expect(debugAdapter.launch).not.toHaveBeenCalled();
  });

  test('refuses to launch when host execution is disabled', async () => {
    debugAdapter.hostExecutionAllowed.mockReturnValueOnce(false);
    currentFile = fileOfA();
    const res = await request(app)
      .post('/api/debug/launch')
      .set(auth('userA'))
      .send({ sessionId: 'sessA', fileId: 'fileA', language: 'javascript' });
    expect(res.status).toBe(403);
    expect(debugAdapter.launch).not.toHaveBeenCalled();
  });

  test('launch own session with own file → 200', async () => {
    currentFile = fileOfA(); // owned by userA, sessA owned by userA
    const res = await request(app)
      .post('/api/debug/launch')
      .set(auth('userA'))
      .send({ sessionId: 'sessA', fileId: 'fileA', language: 'javascript' });
    expect(res.status).toBe(200);
    expect(debugAdapter.launch).toHaveBeenCalled();
  });

  test('launch foreign file as stranger → 403', async () => {
    debugAdapter.sessions.set('sessB', { id: 'sessB', userId: 'userB' });
    currentFile = fileOfA(); // owned by userA
    const res = await request(app)
      .post('/api/debug/launch')
      .set(auth('userB'))
      .send({ sessionId: 'sessB', fileId: 'fileA', language: 'javascript' });
    expect(res.status).toBe(403);
    expect(debugAdapter.launch).not.toHaveBeenCalled();
  });
});
