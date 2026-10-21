/**
 * Enhanced Sandbox Security
 * Additional hardening for code execution
 */

class SandboxSecurity {
    constructor() {
        this.blockedModules = ['fs', 'child_process', 'net', 'http', 'https', 'dgram', 'dns', 'tls', 'cluster', 'vm', 'worker_threads'];
        this.blockedPatterns = [
            /require\s*\(\s*['"]fs['"]\s*\)/,
            /require\s*\(\s*['"]child_process['"]\s*\)/,
            /process\.exit/,
            /eval\s*\(/,
            /Function\s*\(/,
            /__dirname/,
            /__filename/
        ];
    }

    validateCode(code, language = 'javascript') {
        if (!code || typeof code !== 'string') {
            return { valid: false, error: 'Invalid code' };
        }

        if (code.length > 10000) {
            return { valid: false, error: 'Code too long' };
        }

        for (const pattern of this.blockedPatterns) {
            if (pattern.test(code)) {
                return { valid: false, error: 'Blocked pattern detected for security' };
            }
        }

        for (const mod of this.blockedModules) {
            const regex = new RegExp(`require\\s*\\(\\s*['"]${mod}['"]\\s*\\)`, 'g');
            if (regex.test(code)) {
                return { valid: false, error: `Module ${mod} is not allowed in sandbox` };
            }
        }

        return { valid: true };
    }

    sanitizeOptions(options = {}) {
        return {
            timeout: Math.min(options.timeout || 5000, 10000),
            memory: Math.min(options.memory || 128, 256),
            allowNet: false,
            allowFs: false
        };
    }

    createSecureContext() {
        return {
            console: {
                log: (...args) => console.log('[SANDBOX]', ...args),
                error: (...args) => console.error('[SANDBOX]', ...args),
                warn: (...args) => console.warn('[SANDBOX]', ...args)
            },
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            Date,
            Math,
            JSON,
            parseInt,
            parseFloat,
            isNaN,
            isFinite
        };
    }
}

module.exports = new SandboxSecurity();
