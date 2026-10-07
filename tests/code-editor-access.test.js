/**
 * Tenant-isolation negative tests for routes/code-editor.js (audit rec 7).
 *
 * Proves the proven cross-tenant file IDOR stays fixed: user B (no shared
 * workspace, no invite, not a collaborator) must get 403 — never 200 — on
 * another user's file, and 404 only when the file truly doesn't exist.
 *
 * No database: CodeFile/Company/User are mocked, auth uses a real signed JWT
 * (liveness check passes via mocked User.exists).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/CodeFile', () => ({ findById: jest.fn(), findByIdAndDelete: jest.fn(async () => null) }));
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn(async () => null) }));
jest.mock('../utils/virtualFileSystem', () => ({
  fullPathOf: (f) => `/${f?.name || 'file'}`,
  writeFile: jest.fn(async () => null),
  deleteFile: jest.fn(async () => null),
  indexes: new Map(),
  cache: new Map(),
}));

const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const User = require('../models/User');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/code-editor', require('../routes/code-editor'));

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

// File owned by userA in companyA. Plain objects (no mongoose) are fine:
// the guards only use toString()/_id comparisons.
const fileOfA = () => ({
  _id: 'fileA',
  name: 'secret.js',
  path: '/',
  language: 'javascript',
  content: 'original',
  company: 'companyA',
  createdBy: 'userA',
  lastModifiedBy: 'userA',
  collaborators: [],
  versions: [],
  save: jest.fn(async function () { return this; }),
  populate: jest.fn(async function () { return this; }),
  toObject: function () { return { ...this }; },
});

let currentFile = null;
let currentCompany = null;
// findById always returns an awaitable + .populate()-chainable query,
// mirroring mongoose. Tests set the underlying doc via setFile().
function chainable(file) {
  // populate returns the query itself (synchronously, like mongoose) so
  // .populate().populate() chains; awaiting resolves to the doc via then.
  const q = { populate: () => q, then: (resolve) => resolve(file) };
  return q;
}
// .select().lean() chain for Company.findOne.
function selectChain(doc) {
  return { select: () => ({ lean: async () => doc }) };
}
function setFile(file) {
  currentFile = file;
}
function setCompany(doc) {
  currentCompany = doc;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  User.exists.mockResolvedValue({ _id: 'x' }); // liveness passes for everyone
  currentCompany = null; // default: stranger to every company
  Company.findOne.mockImplementation(() => selectChain(currentCompany));
  currentFile = null;
  // NOTE: NOT async — must return the thenable itself (not Promise<thenable>)
  // so `.populate()` chaining works like a mongoose query.
  CodeFile.findById.mockImplementation(() => chainable(currentFile));
});

describe('GET /files/:id', () => {
  test('stranger gets 403, never file content', async () => {
    setFile(fileOfA());
    const res = await request(app).get('/api/code-editor/files/fileA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('original');
  });

  test('owner gets 200', async () => {
    setFile(fileOfA());
    const res = await request(app).get('/api/code-editor/files/fileA').set(auth('userA'));
    expect(res.status).toBe(200);
    expect(res.body.file.content).toBe('original');
  });

  test('company member (non-creator) gets 200', async () => {
    setFile(fileOfA());
    setCompany({ _id: 'companyA' });
    const res = await request(app).get('/api/code-editor/files/fileA').set(auth('userM'));
    expect(res.status).toBe(200);
  });

  test('collaborator gets 200', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    const res = await request(app).get('/api/code-editor/files/fileA').set(auth('userC'));
    expect(res.status).toBe(200);
  });

  test('missing file is 404 (not 403)', async () => {
    setFile(null);
    const res = await request(app).get('/api/code-editor/files/nope').set(auth('userB'));
    expect(res.status).toBe(404);
  });
});

describe('PUT /files/:id', () => {
  test('stranger overwrite is blocked, save never runs', async () => {
    const f = fileOfA();
    setFile(f);
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userB'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
});

describe('DELETE /files/:id', () => {
  test('stranger cannot delete', async () => {
    setFile(fileOfA());
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userB'));
    expect(res.status).toBe(403);
  });
});

describe('POST /files/:id/collaborators', () => {
  test('stranger cannot grant themselves access', async () => {
    const f = fileOfA();
    setFile(f);
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userB'))
      .send({ userId: 'userB', permission: 'admin' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
});

describe('GET /files/:id/versions', () => {
  test('stranger cannot read version history', async () => {
    setFile(fileOfA());
    const res = await request(app).get('/api/code-editor/files/fileA/versions').set(auth('userB'));
    expect(res.status).toBe(403);
  });
});

describe('GET /files?companyId=', () => {
  test('listing a foreign company is 403', async () => {
    const res = await request(app)
      .get('/api/code-editor/files?companyId=companyA')
      .set(auth('userB'));
    expect(res.status).toBe(403);
  });
});
