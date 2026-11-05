/**
 * Tenant-isolation negative tests for routes/vfs.js (audit rec 7).
 *
 * Every workspaceId/fileId/companyId entering these routes must belong to
 * the caller. requirePermission('vfs', …) only gates tiers (its resource
 * check has no 'vfs' case), so these guards are the actual isolation.
 * permissionMatrix is passed through here — tier gating is covered elsewhere.
 *
 * No database: models and vfs/codeSearch backends are mocked; auth uses a
 * real signed JWT (liveness via mocked User.exists).
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/CodeFile', () => ({ findById: jest.fn(), findOne: jest.fn(), findByIdAndDelete: jest.fn(async () => null) }));
jest.mock('../models/Company', () => ({ findOne: jest.fn() }));
jest.mock('../models/LocalProject', () => ({ findById: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../middleware/permissionMatrix', () => ({
  requirePermission: () => (req, res, next) => next(),
}));
jest.mock('../utils/virtualFileSystem', () => ({
  fullPathOf: (f) => `/${f?.name || 'file'}`,
  getTree: jest.fn(async () => []),
  readFile: jest.fn(async () => ({ content: 'x' })),
  readFileByPath: jest.fn(async () => ({ content: 'x' })),
  readFileChunked: jest.fn(async () => []),
  getMetadata: jest.fn(async () => ({ id: 'f' })),
  searchByName: jest.fn(() => []),
  writeFile: jest.fn(async () => null),
  deleteFile: jest.fn(async () => null),
  createFile: jest.fn(async (doc) => ({ ...doc, _id: 'new', toObject() { return { ...this }; } })),
  getStats: jest.fn(async () => ({})),
  buildIndex: jest.fn(async () => ({})),
  clearCache: jest.fn(() => null),
  indexes: new Map(),
  cache: new Map(),
}));
jest.mock('../utils/codeSearchService', () => ({
  search: jest.fn(async () => ({ results: [] })),
  searchByLanguage: jest.fn(async () => ({ results: [] })),
  rebuildIndex: jest.fn(async () => ({})),
  getStats: jest.fn(async () => ({})),
}));

const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const LocalProject = require('../models/LocalProject');
const User = require('../models/User');
const vfs = require('../utils/virtualFileSystem');
const codeSearchService = require('../utils/codeSearchService');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/vfs', require('../routes/vfs'));

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

const WORKSPACE_ID = '507f1f77bcf86cd799439022';
const PROJECT_ID = '507f1f77bcf86cd799439033';

let currentFile = null;
let currentCompany = null;
let currentProject = null;
function chainable(file) {
  const q = { populate: () => q, then: (resolve) => resolve(file) };
  return q;
}
const setFile = (f) => { currentFile = f; };
const setCompany = (c) => { currentCompany = c; };
const setProject = (p) => { currentProject = p; };
const fileOfA = () => ({
  _id: 'fileA', name: 'secret.js', path: '/', language: 'javascript',
  content: 'original', company: WORKSPACE_ID, createdBy: 'userA',
  lastModifiedBy: 'userA', collaborators: [], versions: [],
  save: jest.fn(async function () { return this; }),
  populate: jest.fn(async function () { return this; }),
  toObject: function () { return { ...this }; },
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  User.exists.mockResolvedValue({ _id: 'x' });
  currentFile = null;
  currentCompany = null;
  currentProject = null;
  CodeFile.findById.mockImplementation(() => chainable(currentFile));
  CodeFile.findOne.mockImplementation(() => chainable(currentFile));
  Company.findOne.mockImplementation(() => ({
    select: () => ({ lean: async () => currentCompany }),
  }));
  LocalProject.findById.mockImplementation(() => ({
    select: () => ({ lean: async () => currentProject }),
  }));
});

describe('workspace-scoped reads', () => {
  test('tree of foreign workspace → 403, backend not touched', async () => {
    const res = await request(app).get('/api/vfs/tree/companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.getTree).not.toHaveBeenCalled();
  });

  test('tree of own workspace → 200', async () => {
    setCompany({ _id: WORKSPACE_ID, owner: 'userA' });
    const res = await request(app).get(`/api/vfs/tree/${WORKSPACE_ID}`).set(auth('userA'));
    expect(res.status).toBe(200);
    expect(vfs.getTree).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  test('file read in foreign workspace → 403', async () => {
    const res = await request(app).get('/api/vfs/file/f1?workspaceId=companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.readFile).not.toHaveBeenCalled();
  });

  test('file-by-path in foreign workspace → 403', async () => {
    const res = await request(app).get('/api/vfs/file-by-path?path=/s.js&workspaceId=companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.readFileByPath).not.toHaveBeenCalled();
  });

  test('metadata in foreign workspace → 403', async () => {
    const res = await request(app).get('/api/vfs/metadata/f1?workspaceId=companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.getMetadata).not.toHaveBeenCalled();
  });

  test('search in foreign workspace → 403, index not queried', async () => {
    const res = await request(app).get('/api/vfs/search?query=x&workspaceId=companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(codeSearchService.search).not.toHaveBeenCalled();
  });

  test('stats of foreign workspace → 403', async () => {
    const res = await request(app).get('/api/vfs/stats/companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.getStats).not.toHaveBeenCalled();
  });
});

describe('workspace-scoped mutations', () => {
  test('rebuild-index on foreign workspace → 403', async () => {
    const res = await request(app).post('/api/vfs/rebuild-index/companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.buildIndex).not.toHaveBeenCalled();
  });

  test('clear-cache on foreign workspace → 403', async () => {
    const res = await request(app).post('/api/vfs/clear-cache/companyA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(vfs.clearCache).not.toHaveBeenCalled();
  });

  test('create file into foreign company → 403', async () => {
    const res = await request(app)
      .post('/api/vfs/files')
      .set(auth('userB'))
      .send({ name: 'x.js', language: 'javascript', companyId: 'companyA' });
    expect(res.status).toBe(403);
    expect(vfs.createFile).not.toHaveBeenCalled();
  });

  test('update foreign file → 403, save never runs', async () => {
    const f = fileOfA();
    setFile(f);
    const res = await request(app)
      .put('/api/vfs/files/fileA')
      .set(auth('userB'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('delete foreign file → 403', async () => {
    setFile(fileOfA());
    const res = await request(app).delete('/api/vfs/files/fileA').set(auth('userB'));
    expect(res.status).toBe(403);
    expect(CodeFile.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('read-only member collaborator cannot update → 403', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app)
      .put('/api/vfs/files/fileA')
      .set(auth('userC'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('write member collaborator can update', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'write' }];
    setFile(f);
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app)
      .put('/api/vfs/files/fileA')
      .set(auth('userC'))
      .send({ content: 'updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('read-only member collaborator cannot delete → 403', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app).delete('/api/vfs/files/fileA').set(auth('userC'));
    expect(res.status).toBe(403);
    expect(vfs.deleteFile).not.toHaveBeenCalled();
  });

  test('admin member collaborator can delete', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'admin' }];
    setFile(f);
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app).delete('/api/vfs/files/fileA').set(auth('userC'));
    expect(res.status).toBe(200);
    expect(vfs.deleteFile).toHaveBeenCalledWith('fileA', WORKSPACE_ID);
  });

  test('company owner keeps write access despite a read-only collaborator row', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userO', permission: 'read' }];
    setFile(f);
    setCompany({ _id: WORKSPACE_ID, owner: 'userO' });
    const res = await request(app)
      .put('/api/vfs/files/fileA')
      .set(auth('userO'))
      .send({ content: 'owner-updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('owner-updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('company member without a collaborator row cannot delete (write is not manage)', async () => {
    setFile(fileOfA());
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userM', role: 'member' }] });
    const res = await request(app).delete('/api/vfs/files/fileA').set(auth('userM'));
    expect(res.status).toBe(403);
    expect(vfs.deleteFile).not.toHaveBeenCalled();
  });

  test('company admin without a collaborator row can delete', async () => {
    setFile(fileOfA());
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userAdmin', role: 'admin' }] });
    const res = await request(app).delete('/api/vfs/files/fileA').set(auth('userAdmin'));
    expect(res.status).toBe(200);
    expect(vfs.deleteFile).toHaveBeenCalledWith('fileA', WORKSPACE_ID);
  });

  test('a viewer cannot create files in the workspace', async () => {
    setCompany({ _id: WORKSPACE_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app)
      .post('/api/vfs/files')
      .set(auth('userV'))
      .send({ name: 'x.js', language: 'javascript', companyId: WORKSPACE_ID });
    expect(res.status).toBe(403);
    expect(vfs.createFile).not.toHaveBeenCalled();
  });

  test('create folder in foreign company → 403', async () => {
    const res = await request(app)
      .post('/api/vfs/folders')
      .set(auth('userB'))
      .send({ name: 'evil', path: '/', companyId: 'companyA' });
    expect(res.status).toBe(403);
    expect(vfs.createFile).not.toHaveBeenCalled();
  });

  test('create file attached to a foreign project → 403', async () => {
    setCompany({ _id: WORKSPACE_ID, owner: 'userB' });
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    const res = await request(app)
      .post('/api/vfs/files')
      .set(auth('userB'))
      .send({
        name: 'x.js',
        language: 'javascript',
        companyId: WORKSPACE_ID,
        projectId: PROJECT_ID,
      });
    expect(res.status).toBe(403);
    expect(vfs.createFile).not.toHaveBeenCalled();
  });

  test('create folder attached to a foreign project → 403', async () => {
    setCompany({ _id: WORKSPACE_ID, owner: 'userB' });
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    const res = await request(app)
      .post('/api/vfs/folders')
      .set(auth('userB'))
      .send({ name: 'evil', path: '/', companyId: WORKSPACE_ID, projectId: PROJECT_ID });
    expect(res.status).toBe(403);
    expect(vfs.createFile).not.toHaveBeenCalled();
  });
});
