/**
 * Fail-fast boot config validation (rec 9).
 *
 * Misconfiguration used to surface as cryptic runtime failures (or worse:
 * silently insecure operation). validateBootConfig() returns fatal problems
 * that must abort startup plus non-fatal warnings. Pure function of
 * process.env — safe to unit test without booting the server.
 */
function validateBootConfig({ includeJwtSecret = true } = {}) {
    const fatals = [];
    const warnings = [];

    if (includeJwtSecret) {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            fatals.push('JWT_SECRET must be set to at least 32 characters before the server can listen.');
        }
    }

    if (!process.env.MONGODB_URI) {
        fatals.push('MONGODB_URI is not set — the server cannot serve without a database.');
    }

    const sek = process.env.SECRET_ENCRYPTION_KEY;
    if (sek && !/^[0-9a-fA-F]{64}$/.test(sek)) {
        fatals.push(
            'SECRET_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
            'or unset it to derive the key from JWT_SECRET.'
        );
    }

    if (process.env.TURN_STATIC_SECRET && !process.env.TURN_URL) {
        warnings.push('TURN_STATIC_SECRET is set but TURN_URL is not — no TURN credentials will be issued.');
    }
    if (process.env.TURN_URL && !process.env.TURN_STATIC_SECRET) {
        warnings.push('TURN_URL is set but TURN_STATIC_SECRET is not — only STUN will be served to WebRTC clients.');
    }

    if (!process.env.ADMIN_API_KEY) {
        warnings.push(
            'ADMIN_API_KEY is not set — platform admin endpoints (ban/unban) are disabled.'
        );
    }
    if (process.env.NODE_ENV === 'production' && process.env.IDE_ALLOW_HOST_EXEC === 'true') {
        warnings.push(
            'IDE_ALLOW_HOST_EXEC=true in production: the Run button executes user code ' +
            'on the application host. Only for locked-down dev machines.'
        );
    }
    if (process.env.NODE_ENV === 'production' && String(process.env.TERMINAL_EXEC_MODE || 'auto').toLowerCase() !== 'container') {
        warnings.push(
            'Terminal sessions spawn host shells (TERMINAL_EXEC_MODE!=container). ' +
            'Set TERMINAL_EXEC_MODE=container with VPS transport to isolate execution.'
        );
    }
    if (process.env.TERMINAL_SSH_HOST && !process.env.TERMINAL_SSH_KEY && !process.env.TERMINAL_SSH_KEY_FILE) {
        warnings.push(
            'TERMINAL_SSH_HOST is set without a key (TERMINAL_SSH_KEY or TERMINAL_SSH_KEY_FILE) — ' +
            'dedicated terminal VPS is half-configured; shells fall back to the deploy VPS or host PTY.'
        );
    }
    if (!process.env.FRONTEND_URL) {
        warnings.push(
            'FRONTEND_URL is not set — Stripe/portal URLs will contain "undefined" ' +
            'and emailed links will be broken. Set it to the public frontend origin.'
        );
    }
    if ((process.env.NEXT_PUBLIC_TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_USERNAME) && !process.env.TURN_STATIC_SECRET) {
        warnings.push(
            'NEXT_PUBLIC_TURN_* credentials ship in the JS bundle — move to TURN_URL + TURN_STATIC_SECRET ' +
            'and let clients fetch short-lived credentials from /api/rtc/ice-servers.'
        );
    }

    return { fatals, warnings };
}

module.exports = { validateBootConfig };
