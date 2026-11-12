/**
 * AI provider failover.
 *
 * A single 503 from Gemini ("This model is currently experiencing high
 * demand") used to end the request: no retry, and failover was disabled
 * whenever a provider was configured. Deployment self-heal runs unattended,
 * so that turned a temporary model outage into a permanent failed deployment.
 */
function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: { get: () => null },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

function completion(text) {
    return {
        choices: [{ message: { content: text } }],
    };
}

const ORIGINAL_ENV = { ...process.env };

async function freshService(env = {}) {
    process.env = {
        ...ORIGINAL_ENV,
        OPENROUTER_API_KEY: 'or-key',
        MISTRAL_API_KEY: 'mistral-key',
        AI_PROVIDER: 'openrouter',
        AI_MAX_RETRIES: '0',
        AI_RETRY_BASE_MS: '1',
        AI_RETRY_MAX_MS: '5',
        // A single model unless the test opts into more, so assertions count
        // exactly one request per provider attempt.
        OPENROUTER_FALLBACK_MODELS: ',',
        MISTRAL_FALLBACK_MODELS: ',',
        GROQ_FALLBACK_MODELS: ',',
        GEMINI_FALLBACK_MODELS: ',',
        HUGGINGFACE_FALLBACK_MODELS: ',',
        ...env,
    };
    for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'HUGGINGFACE_API_KEY']) {
        if (!(key in env)) delete process.env[key];
    }
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    return require('../utils/aiService');
}

const messages = [{ role: 'user', content: 'fix the build' }];

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
    delete global.fetch;
});

describe('aiService retries and failover', () => {
    test('retries a 503 on the same model before giving up on the provider', async () => {
        const service = await freshService({ AI_MAX_RETRIES: '2' });
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse(503, { error: 'high demand' }))
            .mockResolvedValueOnce(jsonResponse(503, { error: 'high demand' }))
            .mockResolvedValueOnce(jsonResponse(200, completion('fixed')));

        const result = await service.chat(messages, {
            provider: 'openrouter',
            allowProviderFallback: false,
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('fixed');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('falls back to another configured provider when the preferred one is down', async () => {
        const service = await freshService();
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('openrouter.ai')) {
                return jsonResponse(503, { error: 'Service Unavailable' });
            }
            return jsonResponse(200, completion('mistral reply'));
        });

        const result = await service.chat(messages, { provider: 'openrouter' });

        expect(result.success).toBe(true);
        expect(result.provider).toBe('mistral');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('honours an explicit allowProviderFallback:false', async () => {
        const service = await freshService();
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('openrouter.ai')) {
                return jsonResponse(503, { error: 'Service Unavailable' });
            }
            return jsonResponse(200, completion('mistral reply'));
        });

        const result = await service.chat(messages, {
            provider: 'openrouter',
            allowProviderFallback: false,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/503|unavailable/i);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('tries the provider fallback model when the primary model is retired', async () => {
        const service = await freshService({ OPENROUTER_FALLBACK_MODELS: 'google/gemini-3.8-flash' });
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse(404, { error: 'model not found' }))
            .mockResolvedValueOnce(jsonResponse(200, completion('from fallback model')));

        const result = await service.chat(messages, {
            provider: 'openrouter',
            model: 'anthropic/retired-model',
        });

        expect(result.success).toBe(true);
        const bodies = global.fetch.mock.calls.map((call) => JSON.parse(call[1].body));
        expect(bodies[0].model).toBe('anthropic/retired-model');
        expect(bodies[1].model).toBe('google/gemini-3.8-flash');
    });

    test('does not retry a rejected API key', async () => {
        const service = await freshService();
        global.fetch = jest.fn().mockResolvedValue(
            jsonResponse(401, { error: 'Invalid API Key' })
        );

        const result = await service.chat(messages, {
            provider: 'openrouter',
            allowProviderFallback: false,
        });

        expect(result.success).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('stops failover when every configured provider fails', async () => {
        const service = await freshService();
        global.fetch = jest.fn().mockResolvedValue(
            jsonResponse(503, { error: 'Service Unavailable' })
        );

        const result = await service.chat(messages, { provider: 'openrouter' });

        expect(result.success).toBe(false);
        // openrouter then mistral, one attempt each.
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('reports a cooling provider in the health snapshot after an outage', async () => {
        const service = await freshService();
        global.fetch = jest.fn().mockResolvedValue(
            jsonResponse(503, { error: 'Service Unavailable' })
        );

        await service.chat(messages, { provider: 'openrouter', allowProviderFallback: false });

        const health = service.getHealthSummary();
        const openrouter = health.providers.find((provider) => provider.provider === 'openrouter');
        expect(openrouter.status).toBe('cooling');
        expect(openrouter.lastError).toMatch(/503|unavailable/i);
        expect(service.isProviderCooling('openrouter')).toBe(true);
    });

    test('uses a configured provider when the default provider key is missing', async () => {
        const service = await freshService({ AI_PROVIDER: 'gemini' });
        // freshService only sets OPENROUTER/MISTRAL keys, so the configured
        // gemini default is unavailable.
        expect(service.resolveProvider()).toBe('openrouter');
    });

    test('still rejects an explicitly requested provider that has no key', async () => {
        const service = await freshService({ AI_PROVIDER: 'gemini' });
        expect(() => service.resolveProvider('gemini'))
            .toThrow(/selected but not configured/i);
    });

    test('prefers a provider that is not cooling down', async () => {
        const service = await freshService({ GROQ_API_KEY: 'groq-key' });
        service.providerHealthEntry('openrouter').cooldownUntil = Date.now() + 60000;

        // mistral is current, openrouter is cooling, groq is ready.
        expect(service.getFallbackProvider('mistral')).toBe('groq');
    });
});
