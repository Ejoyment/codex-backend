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

jest.mock('../models/CodeFile', () => ({
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(async () => null),
  findOneAndDelete: jest.fn(async () => null),
  find: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../models/Company', () => ({ findOne: jest.fn(), findById: jest.fn(), find: jest.fn() }));
jest.mock('../models/LocalProject', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/User', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn(async () => null) }));
jest.mock('../utils/personalWorkspace', () => ({
  ensurePersonalWorkspace: jest.fn(async (userId) => ({ _id: `personal-${userId}` })),
}));
jest.mock('../utils/virtualFileSystem', () => ({
  fullPathOf: (f) => `/${f?.name || 'file'}`,
  writeFile: jest.fn(async () => null),
  deleteFile: jest.fn(async () => null),
  indexes: new Map(),
  cache: new Map(),
}));

const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const LocalProject = require('../models/LocalProject');
const User = require('../models/User');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { clearLivenessCache } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/code-editor', require('../routes/code-editor'));

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
const auth = (userId) => ({ Authorization: `Bearer ${tokenFor(userId)}` });

// File owned by userA in companyA. Plain objects (no mongoose) are fine:
// the guards only use toString()/_id comparisons.
const COMPANY_ID = '507f1f77bcf86cd799439022';
const PROJECT_ID = '507f1f77bcf86cd799439033';
const TARGET_ID = '507f1f77bcf86cd799439099';
const fileOfA = () => ({
  _id: 'fileA',
  name: 'secret.js',
  path: '/',
  language: 'javascript',
  content: 'original',
  company: COMPANY_ID,
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
let currentProject = null;
// findById always returns an awaitable + .populate()-chainable query,
// mirroring mongoose. Tests set the underlying doc via setFile().
function chainable(file) {
  // populate returns the query itself (synchronously, like mongoose) so
  // .populate().populate() chains; awaiting resolves to the doc via then.
  const q = { populate: () => q, then: (resolve) => resolve(file) };
  return q;
}
// .select().lean() chain for Company/LocalProject lookups.
function selectChain(doc) {
  return { select: () => ({ lean: async () => doc }) };
}
function fileListChain(files) {
  const q = {
    populate: () => q,
    sort: () => Promise.resolve(files),
    then: (resolve) => resolve(files),
  };
  return q;
}
function setFile(file) {
  currentFile = file;
}
function setCompany(doc) {
  currentCompany = doc;
}
function setProject(doc) {
  currentProject = doc;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  User.exists.mockResolvedValue({ _id: 'x' }); // liveness passes for everyone
  User.findById.mockReturnValue({
    populate: jest.fn(async () => ({ subscription: { tier: 'free' } })),
  });
  currentCompany = null; // default: stranger to every company
  currentProject = null; // default: no project visible
  Company.findOne.mockImplementation(() => selectChain(currentCompany));
  Company.findById.mockImplementation(() => selectChain(currentCompany));
  LocalProject.findById.mockImplementation(() => selectChain(currentProject));
  currentFile = null;
  // NOTE: NOT async — must return the thenable itself (not Promise<thenable>)
  // so `.populate()` chaining works like a mongoose query.
  CodeFile.findById.mockImplementation(() => chainable(currentFile));
  CodeFile.find.mockImplementation(() => fileListChain([]));
  CodeFile.create.mockImplementation(async (doc) => ({
    ...doc,
    _id: 'created-file',
    size: 0,
    updatedAt: new Date(),
    populate: jest.fn(async function () { return this; }),
  }));
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
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userM', role: 'member' }] });
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

  test('read-only collaborator cannot overwrite', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userC'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('write collaborator can overwrite', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'write' }];
    setFile(f);
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userC'))
      .send({ content: 'updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('read-only member collaborator cannot overwrite', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userC'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('write member collaborator can overwrite', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'write' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userC'))
      .send({ content: 'updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('company owner keeps full access despite a read-only collaborator row', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userO', permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userO'))
      .send({ content: 'owner-updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('owner-updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('company viewer without a collaborator row cannot overwrite', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userV'))
      .send({ content: 'pwned' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('viewer with an explicit write grant can overwrite', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userV', permission: 'write' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userV'))
      .send({ content: 'updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('updated');
    expect(f.save).toHaveBeenCalled();
  });

  test('company admin without a collaborator row can overwrite', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userAdmin', role: 'admin' }] });
    const res = await request(app)
      .put('/api/code-editor/files/fileA')
      .set(auth('userAdmin'))
      .send({ content: 'admin-updated' });
    expect(res.status).toBe(200);
    expect(f.content).toBe('admin-updated');
    expect(f.save).toHaveBeenCalled();
  });
});

describe('DELETE /files/:id', () => {
  test('stranger cannot delete', async () => {
    setFile(fileOfA());
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userB'));
    expect(res.status).toBe(403);
  });

  test('write collaborator cannot delete', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'write' }];
    setFile(f);
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userC'));
    expect(res.status).toBe(403);
    expect(CodeFile.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('read-only member collaborator cannot delete', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userC', role: 'member' }] });
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userC'));
    expect(res.status).toBe(403);
    expect(CodeFile.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('company member without a collaborator row cannot delete (write is not manage)', async () => {
    setFile(fileOfA());
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userM', role: 'member' }] });
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userM'));
    expect(res.status).toBe(403);
    expect(CodeFile.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('company admin without a collaborator row can delete', async () => {
    setFile(fileOfA());
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userAdmin', role: 'admin' }] });
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userAdmin'));
    expect(res.status).toBe(200);
    expect(CodeFile.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fileA', company: COMPANY_ID });
  });

  test('viewer cannot delete even with an admin collaborator row', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userV', permission: 'admin' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userV'));
    expect(res.status).toBe(403);
    expect(CodeFile.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('company owner can delete despite a read-only collaborator row', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userO', permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userO'));
    expect(res.status).toBe(200);
    expect(CodeFile.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fileA', company: COMPANY_ID });
  });

  test('admin collaborator can delete', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'admin' }];
    setFile(f);
    const res = await request(app).delete('/api/code-editor/files/fileA').set(auth('userC'));
    expect(res.status).toBe(200);
    expect(CodeFile.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fileA', company: COMPANY_ID });
  });
});

describe('GET /files/:id/collaborators', () => {
  test('stranger cannot list collaborators', async () => {
    setFile(fileOfA());
    const res = await request(app)
      .get('/api/code-editor/files/fileA/collaborators')
      .set(auth('userB'));
    expect(res.status).toBe(403);
  });

  test('viewer can list collaborators but cannot manage them', async () => {
    setFile(fileOfA());
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app)
      .get('/api/code-editor/files/fileA/collaborators')
      .set(auth('userV'));
    expect(res.status).toBe(200);
    expect(res.body.access).toMatchObject({ role: 'viewer', canRead: true, canWrite: false, canManage: false });
  });

  test('owner receives canManage', async () => {
    setFile(fileOfA());
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app)
      .get('/api/code-editor/files/fileA/collaborators')
      .set(auth('userO'));
    expect(res.status).toBe(200);
    expect(res.body.access.canManage).toBe(true);
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

  test('write collaborator cannot grant access', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'write' }];
    setFile(f);
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userC'))
      .send({ userId: TARGET_ID, permission: 'admin' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('company member cannot grant access', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userM', role: 'member' }] });
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userM'))
      .send({ userId: TARGET_ID, permission: 'write' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('viewer with an admin collaborator row still cannot grant access', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userV', permission: 'admin' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userV'))
      .send({ userId: TARGET_ID, permission: 'write' });
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('an admin collaborator can grant read/write', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: 'userC', permission: 'admin' }];
    setFile(f);
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userC'))
      .send({ userId: TARGET_ID, permission: 'write' });
    expect(res.status).toBe(200);
    expect(f.save).toHaveBeenCalled();
    expect(f.collaborators.find((c) => String(c.user) === TARGET_ID)?.permission).toBe('write');
  });

  test('a company admin can grant read/write', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userAdmin', role: 'admin' }] });
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userAdmin'))
      .send({ userId: TARGET_ID, permission: 'read' });
    expect(res.status).toBe(200);
    expect(f.save).toHaveBeenCalled();
    expect(f.collaborators.find((c) => String(c.user) === TARGET_ID)?.permission).toBe('read');
  });

  test('an unknown permission is rejected', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userO'))
      .send({ userId: TARGET_ID, permission: 'owner' });
    expect(res.status).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('an invalid target user id is rejected', async () => {
    const f = fileOfA();
    setFile(f);
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app)
      .post('/api/code-editor/files/fileA/collaborators')
      .set(auth('userO'))
      .send({ userId: 'not-an-object-id', permission: 'read' });
    expect(res.status).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
});

describe('DELETE /files/:id/collaborators/:userId', () => {
  test('a write collaborator cannot remove collaborators', async () => {
    const f = fileOfA();
    f.collaborators = [
      { user: 'userC', permission: 'write' },
      { user: TARGET_ID, permission: 'read' },
    ];
    setFile(f);
    const res = await request(app)
      .delete(`/api/code-editor/files/fileA/collaborators/${TARGET_ID}`)
      .set(auth('userC'));
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('a company member cannot remove collaborators', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: TARGET_ID, permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userM', role: 'member' }] });
    const res = await request(app)
      .delete(`/api/code-editor/files/fileA/collaborators/${TARGET_ID}`)
      .set(auth('userM'));
    expect(res.status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });

  test('an admin collaborator can remove collaborators', async () => {
    const f = fileOfA();
    f.collaborators = [
      { user: 'userC', permission: 'admin' },
      { user: TARGET_ID, permission: 'read' },
    ];
    setFile(f);
    const res = await request(app)
      .delete(`/api/code-editor/files/fileA/collaborators/${TARGET_ID}`)
      .set(auth('userC'));
    expect(res.status).toBe(200);
    expect(f.save).toHaveBeenCalled();
    expect(f.collaborators.find((c) => String(c.user) === TARGET_ID)).toBeUndefined();
  });

  test('a company owner can remove collaborators', async () => {
    const f = fileOfA();
    f.collaborators = [{ user: TARGET_ID, permission: 'read' }];
    setFile(f);
    setCompany({ _id: COMPANY_ID, owner: 'userO' });
    const res = await request(app)
      .delete(`/api/code-editor/files/fileA/collaborators/${TARGET_ID}`)
      .set(auth('userO'));
    expect(res.status).toBe(200);
    expect(f.collaborators.find((c) => String(c.user) === TARGET_ID)).toBeUndefined();
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

describe('GET /files?projectId=', () => {
  test('listing a foreign project is 403 even without companyId', async () => {
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    const res = await request(app)
      .get(`/api/code-editor/files?projectId=${PROJECT_ID}`)
      .set(auth('userB'));
    expect(res.status).toBe(403);
    expect(CodeFile.find).not.toHaveBeenCalled();
  });

  test('project owner lists only that project’s files', async () => {
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    CodeFile.find.mockImplementation(() => fileListChain([{ _id: 'f1', project: PROJECT_ID }]));
    const res = await request(app)
      .get(`/api/code-editor/files?projectId=${PROJECT_ID}`)
      .set(auth('userA'));
    expect(res.status).toBe(200);
    expect(CodeFile.find).toHaveBeenCalledWith({ project: PROJECT_ID });
  });
});

describe('POST /files/batch', () => {
  const batch = (body) => request(app)
    .post('/api/code-editor/files/batch')
    .set(auth('userB'))
    .send(body);

  test('foreign companyId is rejected before any file is created', async () => {
    const res = await batch({
      companyId: COMPANY_ID,
      files: [{ name: 'plant.js', language: 'javascript', content: 'x' }],
    });
    expect(res.status).toBe(403);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });

  test('foreign workspaceId alias is rejected too', async () => {
    const res = await batch({
      workspaceId: COMPANY_ID,
      files: [{ name: 'plant.js', language: 'javascript', content: 'x' }],
    });
    expect(res.status).toBe(403);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });

  test('companyId and a different workspaceId are rejected as ambiguous', async () => {
    const res = await batch({
      companyId: COMPANY_ID,
      workspaceId: '507f1f77bcf86cd799439044',
      files: [{ name: 'plant.js', language: 'javascript', content: 'x' }],
    });
    expect(res.status).toBe(400);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });

  test('foreign projectId is rejected even in an own workspace', async () => {
    setCompany({ _id: COMPANY_ID, owner: 'userB' });
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    const res = await batch({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      files: [{ name: 'plant.js', language: 'javascript', content: 'x' }],
    });
    expect(res.status).toBe(403);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });

  test('without a workspace the authenticated personal workspace is used', async () => {
    const res = await batch({
      files: [{ name: 'own.js', language: 'javascript', content: 'x' }],
    });
    expect(res.status).toBe(200);
    expect(ensurePersonalWorkspace).toHaveBeenCalledWith('userB');
    expect(CodeFile.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'own.js',
      company: 'personal-userB',
      createdBy: 'userB',
    }));
  });
});

describe('POST /files project attachment', () => {
  test('cannot attach a new file to a foreign project', async () => {
    setProject({ _id: PROJECT_ID, userId: 'userA', members: [] });
    const res = await request(app)
      .post('/api/code-editor/files')
      .set(auth('userB'))
      .send({
        name: 'plant.js',
        language: 'javascript',
        content: 'x',
        projectId: PROJECT_ID,
      });
    expect(res.status).toBe(403);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });
});

describe('POST /files role enforcement', () => {
  const createInCompany = (userId) => request(app)
    .post('/api/code-editor/files')
    .set(auth(userId))
    .send({
      name: 'member.js',
      language: 'javascript',
      content: 'x',
      companyId: COMPANY_ID,
    });

  test('a viewer cannot create files in the workspace', async () => {
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userV', role: 'viewer' }] });
    const res = await createInCompany('userV');
    expect(res.status).toBe(403);
    expect(CodeFile.create).not.toHaveBeenCalled();
  });

  test('a member can create files in the workspace', async () => {
    setCompany({ _id: COMPANY_ID, members: [{ user: 'userM', role: 'member' }] });
    const res = await createInCompany('userM');
    expect(res.status).toBe(200);
    expect(CodeFile.create).toHaveBeenCalledWith(expect.objectContaining({
      company: COMPANY_ID,
      createdBy: 'userM',
    }));
  });
});
