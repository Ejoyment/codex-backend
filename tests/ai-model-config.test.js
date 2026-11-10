/**
 * Debug Room AI model config contract.
 *
 * The Debug Room panel previously showed invented model names. It now reads
 * the deployment's real provider configuration, so these tests pin the values
 * returned for the default agent model, the fast-task model and local privacy
 * routing.
 */
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = 'user-1';
        next();
    },
}));

jest.mock('../middleware/rateLimits', () => ({
    aiChatLimiter: (_req, _res, next) => next(),
}));

jest.mock('../middleware/permissionMatrix', () => ({
    checkPermission: jest.fn(async () => ({ allowed: true })),
    requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../utils/aiService', () => ({
    chat: jest.fn(),
    getProviderInfo: jest.fn(),
}));

jest.mock('../utils/aiRouterService', () => ({
    localPrivacyMode: false,
    resolveRequestProvider: jest.fn(),
    normalizeModel: jest.fn(),
    validateModel: jest.fn(),
    isLocalProvider: jest.fn(),
}));

jest.mock('../utils/localBridge', () => ({
    getModels: jest.fn(),
}));

jest.mock('../utils/githubService', () => ({}));
jest.mock('../utils/creditPoolService', () => ({
    AGENT_JOB_CREDIT_COST: 1,
    deductCredits: jest.fn(),
    refundCredits: jest.fn(),
}));
jest.mock('../utils/workspaceAuth', () => ({ assertWorkspaceAccess: jest.fn() }));
jest.mock('../utils/personalWorkspace', () => ({ ensurePersonalWorkspace: jest.fn() }));
jest.mock('../utils/specAccess', () => ({ userCanAccessProject: jest.fn() }));

jest.mock('../models/AIPairSession', () => ({ findOne: jest.fn() }));
jest.mock('../models/ChatMessage', () => ({
    create: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
}));
jest.mock('../models/CodeChange', () => ({ find: jest.fn() }));
jest.mock('../models/AgentExecution', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
}));
jest.mock('../models/Subscription', () => ({ findOne: jest.fn() }));

const aiService = require('../utils/aiService');
const aiRouterService = require('../utils/aiRouterService');
const localBridge = require('../utils/localBridge');
const aiPairRouter = require('../routes/ai-pair');

const app = express();
app.use(express.json());
app.use('/api/ai-pair', aiPairRouter);

const cloudProviders = [
    {
        name: 'groq',
        displayName: 'Groq (Fast Inference)',
        available: true,
        model: 'openai/gpt-oss-120b',
    },
    {
        name: 'gemini',
        displayName: 'Google Gemini',
        available: false,
        model: 'gemini-1.5-flash',
    },
];

beforeEach(() => {
    aiRouterService.localPrivacyMode = false;
    aiService.getProviderInfo.mockReturnValue(cloudProviders);
    localBridge.getModels.mockImplementation(async (provider) => (
        provider === 'ollama' ? ['llama3.1:8b'] : []
    ));
    process.env.AI_PROVIDER = 'groq';
    delete process.env.AI_FAST_PROVIDER;
    delete process.env.AI_FAST_MODEL;
    delete process.env.LOCAL_AI_PROVIDER;
});

describe('GET /api/ai-pair/model-config', () => {
    test('returns the configured default model and a real fast-task model', async () => {
        const res = await request(app).get('/api/ai-pair/model-config').expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.defaultModel).toEqual({
            provider: 'groq',
            providerName: 'Groq (Fast Inference)',
            model: 'openai/gpt-oss-120b',
            type: 'cloud',
        });
        expect(res.body.fastModel).toEqual(res.body.defaultModel);
        expect(res.body.providers).toHaveLength(2);
    });

    test('honours AI_FAST_PROVIDER when that provider is configured', async () => {
        aiService.getProviderInfo.mockReturnValue([
            ...cloudProviders,
            {
                name: 'mistral',
                displayName: 'Mistral AI',
                available: true,
                model: 'mistral-small-latest',
            },
        ]);
        process.env.AI_FAST_PROVIDER = 'mistral';

        const res = await request(app).get('/api/ai-pair/model-config').expect(200);

        expect(res.body.defaultModel.provider).toBe('groq');
        expect(res.body.fastModel).toEqual({
            provider: 'mistral',
            providerName: 'Mistral AI',
            model: 'mistral-small-latest',
            type: 'cloud',
        });
    });

    test('reports local privacy routing only when a local model is connected', async () => {
        const res = await request(app).get('/api/ai-pair/model-config').expect(200);

        expect(res.body.privacy).toMatchObject({
            available: true,
            enabled: false,
            provider: 'ollama',
            providerName: 'Ollama (BYOM)',
            model: 'llama3.1:8b',
        });
    });

    test('returns null models when no provider is configured', async () => {
        aiService.getProviderInfo.mockReturnValue(cloudProviders.map((provider) => ({
            ...provider,
            available: false,
        })));
        localBridge.getModels.mockResolvedValue([]);

        const res = await request(app).get('/api/ai-pair/model-config').expect(200);

        expect(res.body.defaultModel).toBeNull();
        expect(res.body.fastModel).toBeNull();
        expect(res.body.privacy.available).toBe(false);
    });
});
