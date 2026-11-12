/**
 * Failure classification drives whether an AI call is retried, moved to
 * another model/provider, or reported as a configuration problem.
 */
const {
    classifyAiError,
    isTransientAiError,
    isProviderOutageError,
    retryDelayMs,
} = require('../utils/aiResilience');

describe('classifyAiError', () => {
    test('treats Gemini 503 "high demand" as a transient outage', () => {
        const error = new Error(
            '[GoogleGenerativeAI Error]: Error fetching from ' +
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent: ' +
            '[503 Service Unavailable] This model is currently experiencing high demand.'
        );
        const info = classifyAiError(error);
        expect(info.retryable).toBe(true);
        expect(info.kind).toBe('transient');
        expect(info.status).toBe(503);
        expect(isTransientAiError(error)).toBe(true);
        expect(isProviderOutageError(error)).toBe(true);
    });

    test('treats 429 and Retry-After as retryable with a delay', () => {
        const error = new Error('429 Too Many Requests');
        error.status = 429;
        error.retryAfterMs = 2500;
        const info = classifyAiError(error);
        expect(info.retryable).toBe(true);
        expect(info.retryAfterMs).toBe(2500);
    });

    test('parses the Gemini retryDelay detail', () => {
        const error = new Error('429 quota exceeded {"retryDelay":"37s"}');
        expect(classifyAiError(error).retryAfterMs).toBe(37000);
    });

    test('network resets and timeouts are retryable', () => {
        expect(classifyAiError(new Error('fetch failed')).retryable).toBe(true);
        expect(classifyAiError(new Error('read ECONNRESET')).retryable).toBe(true);
        const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
        expect(classifyAiError(timeout).kind).toBe('timeout');
        expect(classifyAiError(timeout).retryable).toBe(true);
    });

    test('a rejected key is not retryable', () => {
        const error = Object.assign(new Error('Invalid API Key'), { status: 401 });
        const info = classifyAiError(error);
        expect(info.retryable).toBe(false);
        expect(info.kind).toBe('auth');
        expect(isProviderOutageError(error)).toBe(false);
    });

    test('a token-limit rejection is not retryable', () => {
        const info = classifyAiError(new Error('Request too large: tokens per minute limit exceeded'));
        expect(info.retryable).toBe(false);
        expect(info.kind).toBe('token_limit');
    });

    test('a retired model is flagged as model-missing', () => {
        const info = classifyAiError(new Error('The model `gemini-1.0` does not exist'));
        expect(info.retryable).toBe(false);
        expect(info.kind).toBe('model');
        expect(info.modelMissing).toBe(true);
    });

    test('unknown errors are not retried', () => {
        const info = classifyAiError(new Error('model returned prose instead of JSON'));
        expect(info.retryable).toBe(false);
        expect(info.kind).toBe('unknown');
    });
});

describe('retryDelayMs', () => {
    test('uses Retry-After when the provider supplies one', () => {
        expect(retryDelayMs(1, { retryAfterMs: 3000 })).toBe(3000);
    });

    test('grows exponentially and respects the cap', () => {
        const first = retryDelayMs(1, { baseDelayMs: 100, maxDelayMs: 10000, jitter: false });
        const second = retryDelayMs(2, { baseDelayMs: 100, maxDelayMs: 10000, jitter: false });
        const capped = retryDelayMs(10, { baseDelayMs: 100, maxDelayMs: 300, jitter: false });
        expect(first).toBe(100);
        expect(second).toBe(200);
        expect(capped).toBe(300);
    });
});
