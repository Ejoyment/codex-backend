/**
 * Tenant-isolation tests for utils/agentSocket.js (audit rec 7).
 *
 * Locks the ownership contract added in the rec-7 pass:
 *  - JWT required on /agent
 *  - client-supplied taskId / specId / workspaceId must belong to the caller
 *    (delegate created executions and mutated LocalTasks before validating)
 *  - handleVerifySpec previously ran sddVerificationService.verifySpec on ANY
 *    specId with no access check — that helper loads AND saves the spec and
 *    can write to the task, so it is now gated by userCanAccessSpec.
 *  - handleApprove referenced `error` outside its catch scope (ReferenceError
 *    on every approve); covered by the approve happy-path test below.
 *
 * Models and services mocked; real socket.io server + real clients on /agent.
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/AgentExecution', () => ({ create: jest.fn(), findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/LocalTask', () => ({ findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/SpecModel', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/CodeFile', () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn() }));
jest.mock('../utils/specAccess', () => ({ userCanAccessSpec: jest.fn(), userCanAccessWorkspace: jest.fn() }));
jest.mock('../utils/aiRouterService', () => ({ routeChat: jest.fn() }));
jest.mock('../utils/sddVerificationService', () => ({ verifySpec: jest.fn() }));
jest.mock('../utils/containerWorker', () => ({ provisionWorker: jest.fn(), teardownWorker: jest.fn() }));
jest.mock('../utils/gitService', () => ({
  merge: jest.fn(),
  reset: jest.fn(),
  init: jest.fn(),
  ensureBaseCommit: jest.fn(),
  createBranch: jest.fn(),
  writeWorkingTree: jest.fn(),
  commitWorkingTree: jest.fn(),
}));
jest.mock('../utils/notificationTriggers', () => ({ notifyAgentEvent: jest.fn() }));
jest.mock('../utils/realtimeBus', () => ({ emitAgentProgress: jest.fn() }));
jest.mock('../utils/terminalService', () => ({}));

const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const SpecModel = require('../models/SpecModel');
const CodeFile = require('../models/CodeFile');
const specAccess = require('../utils/specAccess');
const aiRouterService = require('../utils/aiRouterService');
const sddVerificationService = require('../utils/sddVerificationService');
const gitService = require('../utils/gitService');
const realtimeBus = require('../utils/realtimeBus');
const AgentSocketHandler = require('../utils/agentSocket');
const User = require('../models/User');
const { clearLivenessCache } = require('../middleware/auth');

const USER_A = 'a'.repeat(24);
const USER_B = 'b'.repeat(24);
const TASK_A = '1'.repeat(24);
const TASK_B = '2'.repeat(24);
const SPEC_A = '3'.repeat(24);
const SPEC_B = '4'.repeat(24);
const EXEC_A = '5'.repeat(24);
const EXEC_B = '6'.repeat(24);
const WORKSPACE_A = '7'.repeat(24);

let server;
let io;
let port;
let sockets;

const execFixture = (userId, over = {}) => ({
  _id: EXEC_A,
  userId,
  status: 'awaiting_approval',
  approvalRequired: true,
  logs: [],
  metadata: { ...over.metadata },
  save: jest.fn(async function () { return this; }),
  ...over,
});

const connect = (userId) =>
  new Promise((resolve, reject) => {
    const token = userId === null
      ? undefined
      : jwt.sign({ userId }, process.env.JWT_SECRET);
    const socket = ioClient(`http://localhost:${port}/agent`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const once = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

beforeAll(async () => {
  server = http.createServer();
  io = new Server(server, { cors: { origin: '*' } });
  new AgentSocketHandler(io); // eslint-disable-line no-new
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLivenessCache();
  sockets = [];
  // Socket liveness: accounts resolve as live unless a test says otherwise.
  jest.spyOn(User, 'exists').mockResolvedValue({ _id: 'live' });
  aiRouterService.routeChat.mockResolvedValue({ success: false, error: 'disabled in tests' });
  sddVerificationService.verifySpec.mockResolvedValue({ success: true, passed: true });
  LocalTask.findOne.mockResolvedValue(null);
  SpecModel.findById.mockResolvedValue(null);
  specAccess.userCanAccessSpec.mockResolvedValue(false);
  specAccess.userCanAccessWorkspace.mockResolvedValue(false);
  AgentExecution.create.mockResolvedValue(execFixture(USER_A, { metadata: {} }));
  CodeFile.find.mockResolvedValue([]);
  gitService.init.mockResolvedValue({ success: true });
  gitService.ensureBaseCommit.mockResolvedValue({ success: true });
  gitService.createBranch.mockResolvedValue({ success: true });
});

afterEach(() => {
  sockets.forEach((s) => s.disconnect(true));
});

describe('auth', () => {
  test('connection without a token is rejected', async () => {
    await expect(connect(null)).rejects.toThrow(/Authentication/);
  });

  test('deleted/banned account cannot connect', async () => {
    clearLivenessCache();
    User.exists.mockResolvedValueOnce(null);
    await expect(connect('c'.repeat(24))).rejects.toThrow(/no longer active/i);
  });
});

describe('agent:delegate ownership', () => {
  test('foreign taskId is rejected before any execution is created', async () => {
    LocalTask.findOne.mockResolvedValue(null); // not the caller's task
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:delegate', { taskId: TASK_B, taskTitle: 'x' });
    expect((await err).message).toMatch(/task not found/i);
    expect(AgentExecution.create).not.toHaveBeenCalled();
    expect(LocalTask.findByIdAndUpdate).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('foreign specId is rejected before any execution is created', async () => {
    SpecModel.findById.mockResolvedValue({ _id: SPEC_B, projectId: 'p' });
    specAccess.userCanAccessSpec.mockResolvedValue(false);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:delegate', { specId: SPEC_B });
    expect((await err).message).toMatch(/spec not found|access denied/i);
    expect(AgentExecution.create).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('foreign workspaceId is rejected', async () => {
    specAccess.userCanAccessWorkspace.mockResolvedValue(false);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:delegate', { workspaceId: 'company-not-yours' });
    expect((await err).message).toMatch(/workspace access denied/i);
    expect(AgentExecution.create).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('own task delegates successfully', async () => {
    LocalTask.findOne.mockResolvedValue({ _id: TASK_A, userId: USER_A });
    LocalTask.findByIdAndUpdate.mockResolvedValue({});
    const s = await connect(USER_A);
    const result = once(s, 'agent:delegate-result');
    s.emit('agent:delegate', { taskId: TASK_A, taskTitle: 'mine' });
    const payload = await result;
    expect(payload.success).toBe(true);
    expect(AgentExecution.create).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A }));
    expect(LocalTask.findByIdAndUpdate).toHaveBeenCalledWith(TASK_A, expect.anything());
    s.disconnect();
  });

  test('workspace delegate seeds a base commit and creates an isolated branch', async () => {
    specAccess.userCanAccessWorkspace.mockResolvedValue(true);
    const s = await connect(USER_A);
    const result = once(s, 'agent:delegate-result');
    s.emit('agent:delegate', { workspaceId: WORKSPACE_A, taskTitle: 'branch me' });
    const payload = await result;
    expect(payload.success).toBe(true);
    expect(gitService.init).toHaveBeenCalledWith(WORKSPACE_A);
    expect(gitService.ensureBaseCommit).toHaveBeenCalledWith(WORKSPACE_A, 'main');
    expect(gitService.createBranch).toHaveBeenCalledWith(WORKSPACE_A, expect.stringMatching(/^feature\//));
    s.disconnect();
  });
});

describe('approve / reject ownership', () => {
  test('foreign execution is rejected', async () => {
    AgentExecution.findById.mockResolvedValue(execFixture(USER_B, { _id: EXEC_B }));
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:approve', { executionId: EXEC_B });
    expect((await err).message).toMatch(/execution not found/i);
    s.disconnect();
  });

  test('approve with foreign taskId rejects before mutating anything', async () => {
    const execution = execFixture(USER_A);
    AgentExecution.findById.mockResolvedValue(execution);
    LocalTask.findOne.mockResolvedValue(null);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:approve', { executionId: EXEC_A, taskId: TASK_B });
    expect((await err).message).toMatch(/task not found/i);
    expect(LocalTask.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(execution.save).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('approve happy path completes (regression: catch-scope bug)', async () => {
    const execution = execFixture(USER_A, { metadata: {} });
    AgentExecution.findById.mockResolvedValue(execution);
    LocalTask.findOne.mockResolvedValue({ _id: TASK_A, userId: USER_A });
    LocalTask.findByIdAndUpdate.mockResolvedValue({});
    const s = await connect(USER_A);
    const done = once(s, 'agent:approved');
    s.emit('agent:approve', { executionId: EXEC_A, taskId: TASK_A });
    const payload = await done;
    expect(payload.message).toMatch(/approved/i);
    expect(execution.status).toBe('completed');
    s.disconnect();
  });

  test('approve applies proposed changes to the workspace files', async () => {
    const execution = execFixture(USER_A, {
      metadata: { workspaceId: WORKSPACE_A },
      proposedChanges: [{ path: 'src/a.js', action: 'update', language: 'javascript', content: 'new body' }],
    });
    AgentExecution.findById.mockResolvedValue(execution);
    const doc = { _id: 'f1', name: 'a.js', path: '/src', content: 'old', save: jest.fn(async function () { return this; }) };
    CodeFile.findOne.mockResolvedValue(doc);
    const s = await connect(USER_A);
    const done = once(s, 'agent:approved');
    s.emit('agent:approve', { executionId: EXEC_A });
    const payload = await done;
    expect(payload.message).toMatch(/approved/i);
    expect(CodeFile.findOne).toHaveBeenCalledWith({ company: WORKSPACE_A, name: 'a.js', path: '/src' });
    expect(doc.save).toHaveBeenCalled();
    expect(doc.content).toBe('new body');
    s.disconnect();
  });

  test('reject with foreign taskId rejects before mutating', async () => {
    const execution = execFixture(USER_A);
    AgentExecution.findById.mockResolvedValue(execution);
    LocalTask.findOne.mockResolvedValue(null);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:reject', { executionId: EXEC_A, taskId: TASK_B });
    expect((await err).message).toMatch(/task not found/i);
    expect(execution.save).not.toHaveBeenCalled();
    s.disconnect();
  });
});

describe('agent:verify-spec (was completely ungated)', () => {
  test('foreign specId never reaches verifySpec', async () => {
    SpecModel.findById.mockResolvedValue({ _id: SPEC_B });
    specAccess.userCanAccessSpec.mockResolvedValue(false);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:verify-spec', { specId: SPEC_B });
    expect((await err).message).toMatch(/spec not found|access denied/i);
    expect(sddVerificationService.verifySpec).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('foreign taskId never reaches verifySpec (helper writes to the task)', async () => {
    SpecModel.findById.mockResolvedValue({ _id: SPEC_A });
    specAccess.userCanAccessSpec.mockResolvedValue(true);
    LocalTask.findOne.mockResolvedValue(null);
    const s = await connect(USER_A);
    const err = once(s, 'agent:error');
    s.emit('agent:verify-spec', { specId: SPEC_A, taskId: TASK_B });
    expect((await err).message).toMatch(/task not found/i);
    expect(sddVerificationService.verifySpec).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('accessible spec verifies and responds', async () => {
    SpecModel.findById.mockResolvedValue({ _id: SPEC_A });
    specAccess.userCanAccessSpec.mockResolvedValue(true);
    const s = await connect(USER_A);
    const done = once(s, 'agent:spec-verification');
    s.emit('agent:verify-spec', { specId: SPEC_A });
    await done;
    expect(sddVerificationService.verifySpec).toHaveBeenCalledWith(SPEC_A, undefined);
    s.disconnect();
  });
});
