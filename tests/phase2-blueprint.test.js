const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

describe('Phase 2 - Spec-Driven & Autonomous Workflows', () => {
  describe('Trial subscription defaults', () => {
    test('should create a fully entitled 14-day Pro trial', () => {
      const { createTrialSubscription } = require('../middleware/trial');
      const startedAt = new Date('2026-09-28T12:00:00.000Z');
      const subscription = createTrialSubscription('507f1f77bcf86cd799439011', startedAt);

      expect(subscription.tier).toBe('pro');
      expect(subscription.status).toBe('trial');
      expect(subscription.trialEndsAt.getTime() - subscription.trialStartedAt.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
      expect(subscription.creditPool.monthlyLimit).toBe(20);
      expect(subscription.cloudComputeHours.monthlyLimit).toBe(10);
      expect(subscription.maxConcurrentAgentJobs).toBe(1);
      expect(subscription.specEngineLevel).toBe('full_sdd');
      expect(subscription.pricing.amount).toBe(0);
      expect(subscription.pricing.interval).toBe('trial');
    });

    test('should downgrade an expired trial to Developer without removing free access', () => {
      const { createTrialSubscription, downgradeExpiredTrial } = require('../middleware/trial');
      const startedAt = new Date('2026-09-01T12:00:00.000Z');
      const subscription = createTrialSubscription('507f1f77bcf86cd799439011', startedAt);

      expect(downgradeExpiredTrial(subscription, new Date('2026-09-20T12:00:00.000Z'))).toBe(true);
      expect(subscription.tier).toBe('developer');
      expect(subscription.status).toBe('expired');
      expect(subscription.maxConcurrentAgentJobs).toBe(0);
      expect(subscription.features.basicAiAssistance).toBe(true);
      expect(downgradeExpiredTrial(subscription, new Date('2026-09-21T12:00:00.000Z'))).toBe(false);
    });

    test('should promote a legacy active Developer default to the initial Pro trial', () => {
      const { applyProTrial } = require('../middleware/trial');
      const subscription = new (require('../models/Subscription'))({
        userId: '507f1f77bcf86cd799439011',
        tier: 'developer',
        status: 'active',
      });

      applyProTrial(subscription, new Date('2026-09-28T12:00:00.000Z'));

      expect(subscription.tier).toBe('pro');
      expect(subscription.status).toBe('trial');
      expect(subscription.creditPool.monthlyLimit).toBe(20);
    });
  });

  describe('Spec Model', () => {
    test('should export SpecModel with required fields', () => {
      const SpecModel = require('../models/SpecModel');
      expect(SpecModel).toBeDefined();
      expect(typeof SpecModel.find).toBe('function');
      expect(SpecModel.modelName).toBe('Spec');
      expect(SpecModel.schema).toBeDefined();
    });

    test('should have specId field', () => {
      const SpecModel = require('../models/SpecModel');
      const spec = new SpecModel({
        workspaceId: '507f1f77bcf86cd799439011',
        title: 'Test Spec',
        content: 'Test content',
      });
      expect(spec.specId).toBeDefined();
      expect(spec.specId.length).toBeGreaterThan(0);
    });

    test('should have targetModules field', () => {
      const SpecModel = require('../models/SpecModel');
      const spec = new SpecModel({
        workspaceId: '507f1f77bcf86cd799439011',
        title: 'Test Spec',
        content: 'Test content',
        targetModules: ['src/auth/jwt.ts'],
      });
      expect(spec.targetModules).toEqual(['src/auth/jwt.ts']);
    });

    test('should have assertions array', () => {
      const SpecModel = require('../models/SpecModel');
      const spec = new SpecModel({
        workspaceId: '507f1f77bcf86cd799439011',
        title: 'Test Spec',
        content: 'Test content',
        assertions: [{ rule: 'Must use RS256', target: 'src/auth/jwt.ts' }],
      });
      expect(spec.assertions.length).toBe(1);
      expect(spec.assertions[0].rule).toBe('Must use RS256');
    });
  });

  describe('LocalTask Model - Agent Execution', () => {
    test('should export LocalTask model', () => {
      const LocalTask = require('../models/LocalTask');
      expect(LocalTask).toBeDefined();
      expect(typeof LocalTask.find).toBe('function');
    });

    test('should support agentExecution subdocument', () => {
      const LocalTask = require('../models/LocalTask');
      const task = new LocalTask({
        userId: '507f1f77bcf86cd799439011',
        title: 'Test Task',
      });
      expect(task.agentExecution).toBeDefined();
      expect(task.agentExecution.status).toBe('idle');
    });

    test('should validate agentExecution status enum', () => {
      const LocalTask = require('../models/LocalTask');
      const task = new LocalTask({
        userId: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        agentExecution: { status: 'running' },
      });
      expect(task.agentExecution.status).toBe('running');
    });

    test('should support agentBranch field', () => {
      const LocalTask = require('../models/LocalTask');
      const task = new LocalTask({
        userId: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        agentExecution: { agentBranch: 'agent/test-task-123' },
      });
      expect(task.agentExecution.agentBranch).toBe('agent/test-task-123');
    });

    test('should support diffSummary', () => {
      const LocalTask = require('../models/LocalTask');
      const task = new LocalTask({
        userId: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        agentExecution: {
          diffSummary: { filesChanged: 3, insertions: 50, deletions: 10 },
        },
      });
      expect(task.agentExecution.diffSummary.filesChanged).toBe(3);
    });
  });

  describe('Agent Execution Model', () => {
    test('should export AgentExecution model', () => {
      const AgentExecution = require('../models/AgentExecution');
      expect(AgentExecution).toBeDefined();
      expect(typeof AgentExecution.find).toBe('function');
    });
  });

  describe('AI Router Service', () => {
    test('should export AIRouterService singleton', () => {
      const aiRouter = require('../utils/aiRouterService');
      expect(aiRouter).toBeDefined();
      expect(typeof aiRouter.routeChat).toBe('function');
    });

    test('should have routeCloud method', () => {
      const aiRouter = require('../utils/aiRouterService');
      expect(typeof aiRouter.routeCloud).toBe('function');
    });

    test('should have routeLocal method', () => {
      const aiRouter = require('../utils/aiRouterService');
      expect(typeof aiRouter.routeLocal).toBe('function');
    });

    test('should have setLocalPrivacyMode method', () => {
      const aiRouter = require('../utils/aiRouterService');
      expect(typeof aiRouter.setLocalPrivacyMode).toBe('function');
    });

    test('should have getAvailableProviders method', () => {
      const aiRouter = require('../utils/aiRouterService');
      const providers = aiRouter.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    test('should have getProvider method', () => {
      const aiRouter = require('../utils/aiRouterService');
      const provider = aiRouter.getProvider('gemini');
      expect(provider).toBeDefined();
    });

    test('should have getTokenUsage method', () => {
      const aiRouter = require('../utils/aiRouterService');
      const usage = aiRouter.getTokenUsage();
      expect(usage).toBeDefined();
      expect(usage.totalInput).toBeDefined();
    });

    test('should support Claude provider', () => {
      const aiRouter = require('../utils/aiRouterService');
      const provider = aiRouter.getProvider('claude-sonnet');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('cloud');
    });

    test('should support GPT-4o provider', () => {
      const aiRouter = require('../utils/aiRouterService');
      const provider = aiRouter.getProvider('gpt-4o');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('cloud');
    });

    test('should support Ollama local provider', () => {
      const aiRouter = require('../utils/aiRouterService');
      const provider = aiRouter.getProvider('ollama');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('local');
    });

    test('should support LM Studio local provider', () => {
      const aiRouter = require('../utils/aiRouterService');
      const provider = aiRouter.getProvider('lm-studio');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('local');
    });

    test('should have isLocalProvider method', () => {
      const aiRouter = require('../utils/aiRouterService');
      expect(typeof aiRouter.isLocalProvider).toBe('function');
    });
  });

  describe('Local Bridge', () => {
    test('should export LocalBridge singleton', () => {
      const localBridge = require('../utils/localBridge');
      expect(localBridge).toBeDefined();
      expect(typeof localBridge.chat).toBe('function');
      expect(typeof localBridge.stream).toBe('function');
      expect(typeof localBridge.checkConnection).toBe('function');
    });

    test('should have getStatus method', () => {
      const localBridge = require('../utils/localBridge');
      const status = localBridge.getStatus();
      expect(status).toBeDefined();
      expect(status.ollama).toBeDefined();
      expect(status['lm-studio']).toBeDefined();
    });

    test('should have buildSystemPrompt method', () => {
      const localBridge = require('../utils/localBridge');
      expect(typeof localBridge.buildSystemPrompt).toBe('function');
    });

    test('should have extractCodeBlocks method', () => {
      const localBridge = require('../utils/localBridge');
      const blocks = localBridge.extractCodeBlocks('```js\ncode\n```');
      expect(Array.isArray(blocks)).toBe(true);
    });
  });

  describe('SDD Verification Service', () => {
    test('should export SDDVerificationService singleton', () => {
      const sdd = require('../utils/sddVerificationService');
      expect(sdd).toBeDefined();
      expect(typeof sdd.verifySpec).toBe('function');
      expect(typeof sdd.runSDDVerification).toBe('function');
      expect(typeof sdd.generateDriftReport).toBe('function');
      expect(typeof sdd.checkASTDrift).toBe('function');
    });

    test('should have getDriftWarnings method', () => {
      const sdd = require('../utils/sddVerificationService');
      expect(typeof sdd.getDriftWarnings).toBe('function');
    });

    test('should evaluate structured requirements against scoped snapshot files', async () => {
      const sdd = require('../utils/sddVerificationService');
      const result = await sdd.verifySpecSnapshot({
        _id: 'spec-1',
        targetModules: ['src/auth/**'],
        requirements: [
          { id: 'REQ-001', text: 'Expiration is set', checkType: 'code_pattern', checkConfig: { pattern: 'expiresIn\\s*:\\s*900' }, severity: 'blocking' },
          { id: 'REQ-002', text: 'Auth file exists', checkType: 'file_exists', checkConfig: { path: 'src/auth/jwt/services/token.js' }, severity: 'blocking' },
        ],
        forbiddenImports: ['jsonwebtoken'],
      }, [
        { path: 'src/auth/jwt/services/token.js', content: 'const options = { expiresIn: 900 };' },
        { path: 'src/other.js', content: 'jsonwebtoken' },
      ]);

      expect(result.passed).toBe(true);
      expect(result.requirements.map((item) => item.status)).toEqual(['pass', 'pass']);
      expect(result.forbiddenImports[0].status).toBe('pass');
    });

    test('should not auto-pass a blocking requirement without a check definition', async () => {
      const sdd = require('../utils/sddVerificationService');
      const result = await sdd.verifySpecSnapshot({
        targetModules: ['src/**'],
        requirements: [{ id: 'REQ-001', text: 'Review design', checkType: 'manual', severity: 'blocking' }],
      }, [{ path: 'src/index.js', content: 'export {};' }]);

      expect(result.requirements[0].status).toBe('pending');
      expect(result.passed).toBe(false);
    });
  });

  describe('Agent Routes', () => {
    test('should export agent-v1 router', () => {
      const agentRouter = require('../routes/agent-v1');
      expect(agentRouter).toBeDefined();
      expect(typeof agentRouter).toBe('function');
    });

    test('should have delegate endpoint', () => {
      const agentRouter = require('../routes/agent-v1');
      expect(agentRouter.stack).toBeDefined();
    });

    test('should have approve endpoint', () => {
      const agentRouter = require('../routes/agent-v1');
      expect(agentRouter.stack).toBeDefined();
    });

    test('should have reject endpoint', () => {
      const agentRouter = require('../routes/agent-v1');
      expect(agentRouter.stack).toBeDefined();
    });

    test('should have verify endpoint', () => {
      const agentRouter = require('../routes/agent-v1');
      expect(agentRouter.stack).toBeDefined();
    });
  });

  describe('Spec Routes', () => {
    test('should export specs router', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter).toBeDefined();
      expect(typeof specRouter).toBe('function');
    });

    test('should have POST / endpoint', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter.stack).toBeDefined();
    });

    test('should have GET /workspace/:workspaceId endpoint', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter.stack).toBeDefined();
    });

    test('should have POST /verify endpoint', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter.stack).toBeDefined();
    });

    test('should have POST /drift-report endpoint', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter.stack).toBeDefined();
    });

    test('should have GET /:specId endpoint', () => {
      const specRouter = require('../routes/specs');
      expect(specRouter.stack).toBeDefined();
    });
  });

  describe('Swagger Configuration', () => {
    test('should export swagger specs', () => {
      const swaggerSpecs = require('../config/swagger');
      expect(swaggerSpecs).toBeDefined();
    });

    test('should have Spec schema', () => {
      const swaggerSpecs = require('../config/swagger');
      expect(swaggerSpecs.components.schemas.Spec).toBeDefined();
    });

    test('should have AgentExecution schema', () => {
      const swaggerSpecs = require('../config/swagger');
      expect(swaggerSpecs.components.schemas.AgentExecution).toBeDefined();
    });

    test('should have SpecVerification schema', () => {
      const swaggerSpecs = require('../config/swagger');
      expect(swaggerSpecs.components.schemas.SpecVerification).toBeDefined();
    });

    test('should have DriftReport schema', () => {
      const swaggerSpecs = require('../config/swagger');
      expect(swaggerSpecs.components.schemas.DriftReport).toBeDefined();
    });

    test('should have Agent Execution tag', () => {
      const swaggerSpecs = require('../config/swagger');
      const tagNames = swaggerSpecs.tags.map(t => t.name);
      expect(tagNames).toContain('Agent Execution');
    });

    test('should have Spec-Driven Development tag', () => {
      const swaggerSpecs = require('../config/swagger');
      const tagNames = swaggerSpecs.tags.map(t => t.name);
      expect(tagNames).toContain('Spec-Driven Development');
    });

    test('should have BYOM tag', () => {
      const swaggerSpecs = require('../config/swagger');
      const tagNames = swaggerSpecs.tags.map(t => t.name);
      expect(tagNames).toContain('BYOM');
    });
  });
});
