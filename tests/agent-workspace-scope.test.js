/**
 * HTTP tenant-isolation tests for the agent surfaces.
 *
 * Covers:
 *  - agent-v1 delegate/approve/reject/tweak/verify: caller-owned rows only,
 *    canonical Company workspace ids, project/workspace consistency, and
 *    membership re-checks before VFS/git mutations.
 *  - ai-pair chat/executions/memory: client-supplied company/workspace ids are
 *    authorized before memory reads, execution writes, or credit charges.
 */
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

const USER_A = 'a'.repeat(24);
const USER_B = 'b'.repeat(24);
const WORKSPACE_A = '7'.repeat(24);
const WORKSPACE_B = '8'.repeat(24);
const EXEC_A = '5'.repeat(24);
const TASK_A = '1'.repeat(24);
const PROJECT_A = '9'.repeat(24);
const SESSION_A = '4'.repeat(24);

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.userId = 'a'.repeat(24);
    req.user = { _id: 'a'.repeat(24), userId: 'a'.repeat(24) };
    next();
  },
}));
jest.mock('../middleware/rateLimits', () => ({
  agentDelegateLimiter: (req, _res, next) => next(),
  aiChatLimiter: (req, _res, next) => next(),
}));
jest.mock('../middleware/tierEnforcement', () => ({
  enforceConcurrentJobs: () => (req, _res, next) => {
    req.subscription = { tier: 'pro' };
    next();
  },
  enforceTaskTimeout: () => (_req, _res, next) => next(),
  enforceCreditPool: () => (_req, _res, next) => next(),
  enforceCloudComputeLimit: () => (_req, _res, next) => next(),
}));
jest.mock('../middleware/permissionMatrix', () => ({
  checkPermission: jest.fn(async () => ({ allowed: true })),
  requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../models/AgentExecution', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/LocalTask', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/LocalProject', () => ({ findById: jest.fn() }));
jest.mock('../models/SpecModel', () => ({ findById: jest.fn() }));
jest.mock('../models/Company', () => ({ findById: jest.fn() }));
jest.mock('../models/CodeFile', () => ({ find: jest.fn() }));
jest.mock('../models/AIPairSession', () => ({ findOne: jest.fn() }));
jest.mock('../models/ChatMessage', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../models/CodeChange', () => ({ find: jest.fn() }));
jest.mock('../models/Subscription', () => ({ findOne: jest.fn() }));

jest.mock('../utils/personalWorkspace', () => ({ findPersonalWorkspace: jest.fn() }));
jest.mock('../utils/gitService', () => ({
  init: jest.fn(),
  ensureBaseCommit: jest.fn(),
  createBranch: jest.fn(),
  branches: jest.fn(),
  checkout: jest.fn(),
  merge: jest.fn(),
  deleteBranch: jest.fn(),
}));
jest.mock('../utils/agentChangeSet', () => ({ applyExecutionChanges: jest.fn() }));
jest.mock('../utils/sddVerificationService', () => ({ verifySpec: jest.fn() }));
jest.mock('../utils/specAccess', () => ({
  userCanAccessProject: jest.fn(),
  userCanAccessSpec: jest.fn(),
  resolveAccessibleSpecs: jest.fn(),
}));
jest.mock('../utils/creditPoolService', () => ({
  AGENT_JOB_CREDIT_COST: 1,
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
}));
jest.mock('../utils/realtimeBus', () => ({ emitAgentProgress: jest.fn() }));
jest.mock('../utils/aiService', () => ({ chat: jest.fn() }));
jest.mock('../utils/aiRouterService', () => ({
  resolveRequestProvider: jest.fn((provider, localPrivacyMode) => ({
    provider: provider || 'gemini',
    localPrivacyMode: Boolean(localPrivacyMode),
  })),
  normalizeModel: jest.fn((provider, model) => (model && model !== provider ? model : null)),
  validateModel: jest.fn().mockResolvedValue(true),
  isLocalProvider: jest.fn(() => false),
}));
jest.mock('../utils/githubService', () => ({}));
jest.mock('../utils/teamMemoryService', () => ({ getConventionsPrompt: jest.fn() }));
jest.mock('../utils/aiContextEngine', () => ({ buildCrossToolContext: jest.fn() }));
jest.mock('../utils/agentContextService', () => ({ buildBundle: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/agentOrchestrator', () => ({ executeAgenticLoop: jest.fn() }));
jest.mock('../utils/vectorMemory', () => ({
  store: jest.fn(),
  retrieve: jest.fn(),
  clear: jest.fn(),
  getStats: jest.fn(),
}));
jest.mock('worker_threads', () => {
  const { EventEmitter } = require('events');
  return {
    Worker: jest.fn(() => {
      const worker = new EventEmitter();
      worker.postMessage = jest.fn();
      setImmediate(() => worker.emit('message', { type: 'complete', result: { success: true } }));
      return worker;
    }),
  };
});

const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const LocalProject = require('../models/LocalProject');
const SpecModel = require('../models/SpecModel');
const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const AIPairSession = require('../models/AIPairSession');
const ChatMessage = require('../models/ChatMessage');
const Subscription = require('../models/Subscription');
const { findPersonalWorkspace } = require('../utils/personalWorkspace');
const gitService = require('../utils/gitService');
const agentChangeSet = require('../utils/agentChangeSet');
const sddVerificationService = require('../utils/sddVerificationService');
const specAccess = require('../utils/specAccess');
const CreditPoolService = require('../utils/creditPoolService');
const teamMemoryService = require('../utils/teamMemoryService');
const aiContextEngine = require('../utils/aiContextEngine');
const agentOrchestrator = require('../utils/agentOrchestrator');
const vectorMemory = require('../utils/vectorMemory');

const agentV1Router = require('../routes/agent-v1');
const aiPairRouter = require('../routes/ai-pair');

const app = express();
app.use(express.json());
app.use('/api/v1/agent', agentV1Router);
app.use('/api/ai-pair', aiPairRouter);

const leanDoc = (doc) => ({ select: () => ({ lean: async () => doc }) });
const company = (over = {}) => ({
  _id: WORKSPACE_A,
  owner: USER_A,
  members: [],
  isActive: true,
  ...over,
});
const execution = (over = {}) => ({
  _id: EXEC_A,
  userId: USER_A,
  status: 'awaiting_review',
  approvalRequired: true,
  branch: 'feature/agent',
  baseBranch: 'main',
  metadata: { workspaceId: WORKSPACE_A },
  proposedChanges: [{ path: 'src/a.js', action: 'update', content: 'next' }],
  filesChanged: ['src/a.js'],
  logs: [],
  terminalLog: [],
  tweaks: [],
  save: jest.fn(async function () { return this; }),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();

  Company.findById.mockReturnValue(leanDoc(null));
  findPersonalWorkspace.mockResolvedValue(null);
  LocalTask.findOne.mockResolvedValue(null);
  LocalTask.findOneAndUpdate.mockResolvedValue({});
  LocalTask.countDocuments.mockResolvedValue(0);
  LocalProject.findById.mockReturnValue(leanDoc(null));
  SpecModel.findById.mockResolvedValue(null);
  CodeFile.find.mockReturnValue(leanDoc([]));

  gitService.init.mockResolvedValue({ success: true });
  gitService.ensureBaseCommit.mockResolvedValue({ success: true });
  gitService.createBranch.mockResolvedValue({ success: true });
  gitService.branches.mockResolvedValue({ success: true, branches: ['main'] });
  gitService.checkout.mockResolvedValue({ success: true });
  gitService.merge.mockResolvedValue({ success: true });
  gitService.deleteBranch.mockResolvedValue({ success: true });

  agentChangeSet.applyExecutionChanges.mockResolvedValue({ applied: 1, created: 0, updated: 1, deleted: 0 });
  sddVerificationService.verifySpec.mockResolvedValue({ requirements: [], forbiddenImports: [], results: [] });
  specAccess.userCanAccessProject.mockResolvedValue(true);
  specAccess.userCanAccessSpec.mockResolvedValue(false);
  specAccess.resolveAccessibleSpecs.mockResolvedValue({ ok: true, specs: [] });

  CreditPoolService.deductCredits.mockResolvedValue({ success: true, remaining: 10 });
  CreditPoolService.refundCredits.mockResolvedValue({ success: true });

  AgentExecution.findOne.mockResolvedValue(null);
  AgentExecution.findOneAndUpdate.mockResolvedValue({});
  AgentExecution.findByIdAndUpdate.mockResolvedValue({});
  AgentExecution.create.mockImplementation(async (doc) => execution({
    ...doc,
    metadata: doc.metadata || {},
    status: doc.status || 'queued',
  }));

  Subscription.findOne.mockResolvedValue({ tier: 'pro' });
  ChatMessage.countDocuments.mockResolvedValue(0);
  ChatMessage.create.mockResolvedValue({});
  ChatMessage.find.mockReturnValue({
    sort: () => ({ limit: () => ({ select: async () => [] }) }),
  });
  AIPairSession.findOne.mockResolvedValue({ _id: SESSION_A, userId: USER_A, save: jest.fn() });
  teamMemoryService.getConventionsPrompt.mockResolvedValue('');
  aiContextEngine.buildCrossToolContext.mockResolvedValue({});
  agentOrchestrator.executeAgenticLoop.mockResolvedValue({
    success: true,
    summary: {},
    iterations: [],
  });
  vectorMemory.store.mockResolvedValue({ stored: true });
  vectorMemory.retrieve.mockResolvedValue([]);
  vectorMemory.clear.mockResolvedValue({ cleared: true });
  vectorMemory.getStats.mockResolvedValue({ count: 0 });
});

describe('agent-v1 workspace authorization', () => {
  test('delegate rejects a foreign workspace before creating a branch', async () => {
    const res = await request(app)
      .post('/api/v1/agent/delegate')
      .send({ taskTitle: 'build it', workspaceId: WORKSPACE_B });

    expect(res.status).toBe(403);
    expect(gitService.init).not.toHaveBeenCalled();
    expect(AgentExecution.create).not.toHaveBeenCalled();
  });

  test('delegate rejects a task whose project belongs to another workspace', async () => {
    Company.findById.mockReturnValue(leanDoc(company()));
    LocalTask.findOne.mockResolvedValue({ _id: TASK_A, userId: USER_A, projectId: PROJECT_A });
    LocalProject.findById.mockReturnValue(leanDoc({ workspaceId: WORKSPACE_B }));

    const res = await request(app)
      .post('/api/v1/agent/delegate')
      .send({ taskId: TASK_A, workspaceId: WORKSPACE_A });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/project does not belong/i);
    expect(AgentExecution.create).not.toHaveBeenCalled();
  });

  test('delegate rejects a foreign task project with no workspace', async () => {
    Company.findById.mockReturnValue(leanDoc(company()));
    LocalTask.findOne.mockResolvedValue({ _id: TASK_A, userId: USER_A, projectId: PROJECT_A });
    LocalProject.findById.mockReturnValue(leanDoc({ workspaceId: null }));
    specAccess.userCanAccessProject.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/agent/delegate')
      .send({ taskId: TASK_A, workspaceId: WORKSPACE_A });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/project access denied/i);
    expect(AgentExecution.create).not.toHaveBeenCalled();
  });

  test('delegate resolves a personal user id to the canonical Company workspace', async () => {
    findPersonalWorkspace.mockResolvedValue(company());

    const res = await request(app)
      .post('/api/v1/agent/delegate')
      .send({ taskTitle: 'personal workspace task', workspaceId: USER_A });

    expect(res.status).toBe(202);
    expect(gitService.init).toHaveBeenCalledWith(WORKSPACE_A);
    expect(AgentExecution.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A,
      metadata: expect.objectContaining({ workspaceId: WORKSPACE_A }),
    }));
  });

  test('approve rejects an execution whose stored workspace is no longer accessible', async () => {
    AgentExecution.findOne.mockResolvedValue(execution());
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/v1/agent/approve')
      .send({ executionId: EXEC_A });

    expect(res.status).toBe(403);
    expect(agentChangeSet.applyExecutionChanges).not.toHaveBeenCalled();
    expect(sddVerificationService.verifySpec).not.toHaveBeenCalled();
  });

  test('approve rejects a foreign taskId before applying changes', async () => {
    AgentExecution.findOne.mockResolvedValue(execution());
    Company.findById.mockReturnValue(leanDoc(company()));
    LocalTask.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/agent/approve')
      .send({ executionId: EXEC_A, taskId: TASK_A });

    expect(res.status).toBe(404);
    expect(agentChangeSet.applyExecutionChanges).not.toHaveBeenCalled();
  });

  test('reject re-checks the stored workspace before mutating', async () => {
    const doc = execution();
    AgentExecution.findOne.mockResolvedValue(doc);
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/v1/agent/reject')
      .send({ executionId: EXEC_A });

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
    expect(gitService.deleteBranch).not.toHaveBeenCalled();
  });

  test('tweak refuses a foreign workspace before charging credits', async () => {
    AgentExecution.findOne.mockResolvedValue(execution());
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/v1/agent/tweak')
      .send({ executionId: EXEC_A, instruction: 'make it faster' });

    expect(res.status).toBe(403);
    expect(CreditPoolService.deductCredits).not.toHaveBeenCalled();
  });

  test('verify rejects a foreign taskId before writing verification results', async () => {
    SpecModel.findById.mockResolvedValue({ _id: '3'.repeat(24) });
    specAccess.userCanAccessSpec.mockResolvedValue(true);
    LocalTask.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/agent/verify')
      .send({ specId: '3'.repeat(24), taskId: TASK_A });

    expect(res.status).toBe(404);
    expect(sddVerificationService.verifySpec).not.toHaveBeenCalled();
  });
});

describe('ai-pair workspace authorization', () => {
  test('chat rejects a foreign companyId before saving the message', async () => {
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/ai-pair/chat')
      .send({ sessionId: SESSION_A, message: 'hello', companyId: WORKSPACE_B });

    expect(res.status).toBe(403);
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('agent-loop chat rejects a foreign codeContext workspace before charging', async () => {
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/ai-pair/chat')
      .send({
        sessionId: SESSION_A,
        message: 'run the agent',
        useAgentLoop: true,
        codeContext: { workspace: { id: WORKSPACE_B } },
      });

    expect(res.status).toBe(403);
    expect(CreditPoolService.deductCredits).not.toHaveBeenCalled();
    expect(AgentExecution.create).not.toHaveBeenCalled();
  });

  test('execution creation rejects a foreign workspace', async () => {
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/ai-pair/executions')
      .send({ sessionId: SESSION_A, taskTitle: 'task', workspaceId: WORKSPACE_B });

    expect(res.status).toBe(403);
    expect(AgentExecution.create).not.toHaveBeenCalled();
  });

  test('execution patch rejects a foreign metadata workspace', async () => {
    const doc = execution();
    AgentExecution.findOne.mockResolvedValue(doc);
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .patch(`/api/ai-pair/executions/${EXEC_A}`)
      .send({ metadata: { workspaceId: WORKSPACE_B } });

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('memory store rejects a foreign workspace', async () => {
    Company.findById.mockReturnValue(leanDoc(null));

    const res = await request(app)
      .post('/api/ai-pair/memory/store')
      .send({ content: 'pattern', workspaceId: WORKSPACE_B });

    expect(res.status).toBe(403);
    expect(vectorMemory.store).not.toHaveBeenCalled();
  });
});
