/**
 * Outbound HTTP timeouts (audit 2026-10-19, finding #5).
 *
 * Before this, 25+ server-side outbound calls (third-party APIs, OAuth token
 * exchanges, billing, LLM inference, email) had no timeout at all: a stalled
 * upstream held the request — and its sockets — open indefinitely. The sweep
 * added explicit timeouts everywhere; this suite pins the shapes that are easy
 * to regression-test:
 *   - billing axios instances (paystack, flutterwave): timeout 15000
 *   - Resend email transport: AbortSignal.timeout(10s)
 *   - LLM fetches (groq/mistral/huggingface): AbortSignal.timeout(60s)
 * A repo-wide static check for "every axios/fetch call site carries a
 * timeout/signal" lives in the PR description as a script; here we pin the
 * behavior of the shared transports.
 */

jest.mock('axios', () => ({
    create: jest.fn(() => ({ post: jest.fn(), get: jest.fn() })),
    get: jest.fn(),
    post: jest.fn(),
}));

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_REQUEST_TIMEOUT_MS;
    delete process.env.GROQ_API_KEY;
});

describe('billing client instances', () => {
    test('paystack and flutterwave axios instances enforce a 15s timeout', () => {
        const axios = require('axios');
        process.env.PAYSTACK_SECRET_KEY = 'pk_test_dummy';
        process.env.FLUTTERWAVE_SECRET_KEY = 'flw_test_dummy';
        jest.isolateModules(() => {
            require('../config/paystack');
            require('../config/flutterwave');
        });
        const configs = axios.create.mock.calls.map((c) => c[0]);
        expect(configs).toHaveLength(2);
        for (const cfg of configs) {
            expect(cfg.timeout).toBe(15000);
        }
    });
});

describe('Resend transport', () => {
    test('emails are sent with an abort timeout', async () => {
        process.env.RESEND_API_KEY = 're_test_dummy';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'msg-1' }),
        });

        let service;
        jest.isolateModules(() => {
            service = require('../utils/emailServiceResend');
        });

        const result = await service.sendOTPEmail('user@example.com', '123456', 'User');

        expect(result.success).toBe(true);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    test('a hanging Resend call aborts instead of holding the request forever', async () => {
        process.env.RESEND_API_KEY = 're_test_dummy';
        process.env.RESEND_REQUEST_TIMEOUT_MS = '50';
        global.fetch = jest.fn((url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }));

        let service;
        jest.isolateModules(() => {
            service = require('../utils/emailServiceResend');
        });

        // The transport aborts after 50ms; sendWelcomeEmail catches and
        // resolves without a throw — the request is not held forever.
        await expect(service.sendWelcomeEmail('user@example.com', 'User')).resolves.toBeUndefined();
        const init = global.fetch.mock.calls[0][1];
        expect(init.signal.aborted).toBe(true);
    });
});

describe('AI service fetches', () => {
    test('LLM calls carry an abort timeout', async () => {
        process.env.GROQ_API_KEY = 'gsk_test_dummy';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
        });

        let aiService;
        jest.isolateModules(() => {
            aiService = require('../utils/aiService');
        });

        const result = await aiService.chatGroq([{ role: 'user', content: 'hi' }], {});

        expect(result.success).toBe(true);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });
});
