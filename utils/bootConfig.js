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

    if (process.env.NEXT_PUBLIC_DEV_PASSWORD) {
        warnings.push(
            'NEXT_PUBLIC_DEV_PASSWORD is obsolete and ships the gate password in the JS bundle — ' +
            'unset it and use server-side DEV_GATE_PASSWORD instead.'
        );
    }
    if (process.env.DEV_GATE_PASSWORD && process.env.DEV_GATE_PASSWORD.length < 12) {
        warnings.push('DEV_GATE_PASSWORD is set but short — use a long random value.');
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
