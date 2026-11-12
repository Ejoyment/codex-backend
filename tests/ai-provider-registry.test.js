/**
 * AI provider registry (audit 2026-10-19).
 *
 * The router used to advertise claude-sonnet/gpt-4o/ollama/lm-studio while
 * utils/aiService only implements gemini/mistral/groq/huggingface. Client
 * payloads (agent sockets, agent-v1) can carry a provider name, so picking a
 * "Claude" option was silently served by Gemini with no error anywhere.
 * These tests pin: only implemented providers are listed, and unsupported
 * names are rejected rather than silently substituted.
 */
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

const aiRouterService = require('../utils/aiRouterService');
const aiService = require('../utils/aiService');
const { implementedProviderNames, isImplementedProvider } = require('../config/aiProviders');

const LEGACY = ['claude-sonnet', 'gpt-4o', 'ollama', 'lm-studio'];
const IMPLEMENTED = ['openrouter', 'gemini', 'mistral', 'groq', 'huggingface'];

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

    test('legacy provider names are rejected instead of rerouted', () => {
        expect(() => aiRouterService.resolveProviderName('claude-sonnet'))
            .toThrow(/provider "claude-sonnet" is not supported/i);
    });

    test('implemented provider names pass through untouched', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { provider, substitutedFrom } = aiRouterService.resolveProviderName('gemini');
        expect(provider).toBe('gemini');
        expect(substitutedFrom).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    test('aiService rejects unsupported providers instead of substituting', () => {
        expect(() => aiService.resolveProvider('gpt-4o'))
            .toThrow(/provider "gpt-4o" is not supported/i);
    });

    test('every configured provider has fallback models that are not its primary', () => {
        const definitions = require('../config/aiProviders').providerDefinitions();
        for (const [name, definition] of Object.entries(definitions)) {
            expect(Array.isArray(definition.fallbackModels)).toBe(true);
            expect(definition.fallbackModels).not.toContain(definition.model);
            if (IMPLEMENTED.includes(name) && name !== 'huggingface') {
                // Self-heal needs a second model to try when the primary is
                // overloaded ("This model is experiencing high demand").
                expect(definition.fallbackModels.length).toBeGreaterThan(0);
            }
        }
    });

    test('fallback models are configurable per provider', () => {
        const { providerDefinitions } = require('../config/aiProviders');
        const previous = process.env.GEMINI_FALLBACK_MODELS;
        process.env.GEMINI_FALLBACK_MODELS = 'gemini-3.7-flash,gemini-3.8-flash';
        try {
            const gemini = providerDefinitions().gemini;
            // The primary is removed from its own fallback list.
            expect(gemini.fallbackModels).toEqual(['gemini-3.7-flash']);
        } finally {
            if (previous === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
            else process.env.GEMINI_FALLBACK_MODELS = previous;
        }
    });
});
