/**
 * Production OTP delivery must fail loudly, never mock (audit 2026-10-19).
 *
 * The console mock prints the real verification code and reports success.
 * In production that combination is two bugs at once: verifiable codes leak
 * into whatever reads the logs, and a delivery outage is invisible to both
 * the user (no email ever arrives) and the caller (response says "sent").
 */
const emailService = require('../utils/emailServiceResend');

describe('OTP email fail-mode', () => {
    const ORIGINAL_ENV = process.env.NODE_ENV;
    const ORIGINAL_KEY = process.env.RESEND_API_KEY;

    afterEach(() => {
        process.env.NODE_ENV = ORIGINAL_ENV;
        if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = ORIGINAL_KEY;
        jest.restoreAllMocks();
    });

    it('fails (no mock, no code in logs) in production without RESEND_API_KEY', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.RESEND_API_KEY;

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const result = await emailService.sendOTPEmail('user@example.com', '123456', 'User');

        expect(result.success).toBe(false);
        const logged = logSpy.mock.calls.flat().join(' ');
        expect(logged).not.toContain('123456');
    });

    it('still mocks outside production when RESEND_API_KEY is absent', async () => {
        process.env.NODE_ENV = 'test';
        delete process.env.RESEND_API_KEY;

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const result = await emailService.sendOTPEmail('user@example.com', '123456', 'User');

        expect(result.success).toBe(true);
        expect(result.isMock).toBe(true);
        expect(logSpy.mock.calls.flat().join(' ')).toContain('123456');
    });
});
