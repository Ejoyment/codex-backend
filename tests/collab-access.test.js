/**
 * Tenant-isolation negative tests for routes/collaboration.js and
 * routes/collaboration-overlay.js (audit rec 7).
 *
 * Covers: file-collab presence/join on foreign files, overlay/start without
 * (or with foreign) companyId, and overlay join access-mode enforcement
 * (company / invited / public / host).
 *
 * No database: models and collab backends are mocked; auth uses a real
 * signed JWT (liveness via mocked User.exists).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/CodeFile', () => ({ findById: jest.fn(), findByIdAndDelete: jest.fn(async () => null) }));
jest.mock('../models/Company', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../models/MeetingRoom', () => ({ findById: jest.fn(), create: jest.fn() }));
jest.mock('../models/MeetingOverlay', () => ({ findById: jest.fn(), create: jest.fn() }));
jest.mock('../utils/collaborationService', () => ({
  getActiveUsers: jest.fn(() => []),
  loadDocument: jest.fn(async () => ({})),
}));

const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const User = require('../models/User');
const MeetingRoom = require('../models/MeetingRoom');
const MeetingOverlay = require('../models/MeetingOverlay');
const collaborationService = require('../utils/collaborationService');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/collaboration', require('../routes/collaboration'));
app.use('/api/collab-overlay', require('../routes/collaboration-overlay'));

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

let currentFile = null;
let currentCompany = null;
let currentMembers = [];
// companyA always exists (owned by userA); anything else is missing.
const companyADoc = () => ({ _id: 'companyA', owner: 'userA', members: currentMembers });
function chainable(doc) {
  const q = { populate: () => q, then: (resolve) => resolve(doc) };
  return q;
}
function selectChain(doc) {
  return { select: () => ({ lean: async () => doc }) };
}
const fileOfA = () => ({
  _id: 'fileA', name: 'secret.js', path: '/', language: 'javascript',
  content: 'original', company: 'companyA', createdBy: 'userA',
  lastModifiedBy: 'userA', collaborators: [], versions: [],
});
const meetingDoc = () => ({
  _id: 'meet1', roomId: 'room1', participants: [], status: 'scheduled',
  save: jest.fn(async function () { return this; }),
});
const overlayDoc = (over = {}) => ({
  _id: 'ov1', status: 'active', meetingId: 'meet1', companyId: 'companyA',
  hostUserId: 'userA', context: {}, access: { mode: 'company', invitedUserIds: [] },
  save: jest.fn(async function () { return this; }),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  User.exists.mockResolvedValue({ _id: 'x' });
  currentFile = null;
  currentCompany = null;
  currentMembers = [];
  CodeFile.findById.mockImplementation(() => chainable(currentFile));
  const companyQuery = () => selectChain(currentCompany);
  Company.findOne.mockImplementation(companyQuery);
  Company.findById.mockImplementation(async (id) =>
    String(id) === 'companyA' ? companyADoc() : null
  );
});

describe('file collab presence/join', () => {
  test('presence on foreign file → 403, no presence leaked', async () => {
    currentFile = fileOfA();
    const res = await request(app).get('/api/collaboration/file/fileA/users').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(collaborationService.getActiveUsers).not.toHaveBeenCalled();
  });

  test('presence on own file → 200', async () => {
    currentFile = fileOfA();
    const res = await request(app).get('/api/collaboration/file/fileA/users').set(auth('userA'));
    expect(res.status).toBe(200);
  });

  test('join foreign file session → 403, doc not loaded', async () => {
    currentFile = fileOfA();
    const res = await request(app).post('/api/collaboration/file/fileA/join').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(collaborationService.loadDocument).not.toHaveBeenCalled();
  });

  test('join own file session → 200', async () => {
    currentFile = fileOfA();
    const res = await request(app).post('/api/collaboration/file/fileA/join').set(auth('userA'));
    expect(res.status).toBe(200);
    expect(collaborationService.loadDocument).toHaveBeenCalledWith('fileA');
  });
});

describe('overlay/start companyId', () => {
  test('missing companyId → 400 (not a company-less meeting)', async () => {
    const res = await request(app)
      .post('/api/collab-overlay/overlay/start')
      .set(auth('userA'))
      .send({ title: 'x', context: 'general' });
    expect(res.status).toBe(400);
    expect(MeetingRoom.create).not.toHaveBeenCalled();
  });

  test('foreign companyId → 403, nothing created', async () => {
    const res = await request(app)
      .post('/api/collab-overlay/overlay/start')
      .set(auth('userB'))
      .send({ title: 'x', context: 'general', companyId: 'companyA' });
    expect(res.status).toBe(403);
    expect(MeetingRoom.create).not.toHaveBeenCalled();
    expect(MeetingOverlay.create).not.toHaveBeenCalled();
  });

  test('own companyId → 201 with verified company attached', async () => {
    currentCompany = { _id: 'companyA' };
    MeetingRoom.create.mockResolvedValue({
      _id: 'meet1', populate: jest.fn(async function () { return this; }),
    });
    MeetingOverlay.create.mockResolvedValue({ _id: 'ov1', context: {}, access: {} });
    const res = await request(app)
      .post('/api/collab-overlay/overlay/start')
      .set(auth('userA'))
      .send({ title: 'x', context: 'general', companyId: 'companyA' });
    expect(res.status).toBe(201);
    expect(MeetingRoom.create).toHaveBeenCalledWith(expect.objectContaining({ company: 'companyA' }));
    expect(MeetingOverlay.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'companyA' }));
  });
});

describe('overlay join access modes', () => {
  test('invited-mode stranger → 403, meeting untouched', async () => {
    const m = meetingDoc();
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({
      access: { mode: 'invited', invitedUserIds: [] },
    }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(m.save).not.toHaveBeenCalled();
  });

  test('invited-mode invitee → 200', async () => {
    const m = meetingDoc();
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({
      access: { mode: 'invited', invitedUserIds: ['userB'] },
    }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userB'));
    expect(res.status).toBe(200);
    expect(m.save).toHaveBeenCalled();
  });

  test('company-mode stranger → 403', async () => {
    const m = meetingDoc();
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({ access: { mode: 'company', invitedUserIds: [] } }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(m.save).not.toHaveBeenCalled();
  });

  test('company-mode member → 200', async () => {
    const m = meetingDoc();
    currentCompany = { _id: 'companyA' };
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({ access: { mode: 'company', invitedUserIds: [] } }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userB'));
    expect(res.status).toBe(200);
  });

  test('public-mode stranger → 200', async () => {
    const m = meetingDoc();
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({ access: { mode: 'public', invitedUserIds: [] } }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userB'));
    expect(res.status).toBe(200);
  });

  test('host bypasses mode checks → 200', async () => {
    const m = meetingDoc();
    MeetingOverlay.findById.mockResolvedValue(overlayDoc({
      access: { mode: 'invited', invitedUserIds: [] },
    }));
    MeetingRoom.findById.mockImplementation(() => chainable(m));
    const res = await request(app).post('/api/collab-overlay/overlay/ov1/join').set(auth('userA'));
    expect(res.status).toBe(200);
  });

  test('missing overlay → 404', async () => {
    MeetingOverlay.findById.mockResolvedValue(null);
    const res = await request(app).post('/api/collab-overlay/overlay/nope/join').set(auth('userB'));
    expect(res.status).toBe(404);
  });
});
