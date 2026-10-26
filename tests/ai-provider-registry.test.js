/**
 * AI provider registry (audit 2026-10-19).
 *
 * The router used to advertise claude-sonnet/gpt-4o/ollama/lm-studio while
 * utils/aiService only implements gemini/mistral/groq/huggingface. Client
 * payloads (agent sockets, agent-v1) can carry a provider name, so picking a
 * "Claude" option was silently served by Gemini with no error anywhere.
 * These tests pin: only implemented providers are listed, and legacy or
 * unknown names resolve with an explicit warning — never silently.
 */
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

const aiRouterService = require('../utils/aiRouterService');
const aiService = require('../utils/aiService');
const { implementedProviderNames, isImplementedProvider } = require('../config/aiProviders');

const LEGACY = ['claude-sonnet', 'gpt-4o', 'ollama', 'lm-studio'];
const IMPLEMENTED = ['gemini', 'mistral', 'groq', 'huggingface'];

describe('AI provider registry', () => {
    afterEach(() => jest.restoreAllMocks());

    test('router lists only providers aiService can serve', () => {
        expect(Object.keys(aiRouterService.providers).sort()).toEqual([...IMPLEMENTED].sort());
        for (const legacy of LEGACY) {
            expect(aiRouterService.providers[legacy]).toBeUndefined();
        }
    });

    test('router and implementation consume the same registry (#4)', () => {
        const expected = implementedProviderNames().sort();
        expect(Object.keys(aiRouterService.providers).sort()).toEqual(expected);
        expect(Object.keys(aiService.providers).sort()).toEqual(expected);
        for (const name of Object.keys(aiRouterService.providers)) {
            expect(aiRouterService.getProvider(name).implemented).toBe(true);
            expect(isImplementedProvider(name)).toBe(true);
        }
    });

    test('getAvailableProviders hides unconfigured providers', () => {
        const providers = aiRouterService.getAvailableProviders();
        expect(providers.length).toBeGreaterThan(0);
        for (const p of providers) {
            expect(IMPLEMENTED).toContain(p.key);
        }
        // No unconfigured provider can appear: e.g. mistral with no key.
        if (!process.env.MISTRAL_API_KEY) {
            expect(providers.find((p) => p.key === 'mistral')).toBeUndefined();
        }
    });

    test('legacy provider name resolves to a served provider and warns', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { provider, substitutedFrom } = aiRouterService.resolveProviderName('claude-sonnet');
        expect(substitutedFrom).toBe('claude-sonnet');
        expect(aiRouterService.providers[provider]).toBeDefined();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    test('implemented provider names pass through untouched', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { provider, substitutedFrom } = aiRouterService.resolveProviderName('groq');
        expect(provider).toBe('groq');
        expect(substitutedFrom).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    test('aiService warns instead of silently substituting an unroutable request', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const resolved = aiService.resolveProvider('gpt-4o');
        expect(IMPLEMENTED).toContain(resolved);
        expect(resolved).not.toBe('gpt-4o');
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
