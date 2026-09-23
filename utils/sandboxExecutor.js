/**
 * Sandbox Executor
 *
 * Provides safe code execution environment for the AI agent.
 * Uses Docker containers exclusively (via sandboxSecurity.js) for
 * real OS-level isolation. VM2 and other in-process sandboxes have
 * been removed due to known escape vulnerabilities.
 *
 * Supported languages: JavaScript, Python, Java, Go, Rust, Ruby, PHP.
 */

const sandboxSecurity = require('./sandboxSecurity');

class SandboxExecutor {
    constructor() {
        this.timeout = parseInt(process.env.SANDBOX_TIMEOUT) || 5000;
        this.memoryLimit = parseInt(process.env.SANDBOX_MEMORY_LIMIT) || 128; // MB, used as fallback
        this.available = false;
        this.initialize();
    }

    async initialize() {
        this.available = await sandboxSecurity.isDockerAvailable();
        if (this.available) {
            console.log('✓ Sandbox Executor initialized with Docker backend');
        } else {
            console.warn('⚠ Docker not available — code execution is disabled');
        }
    }

    /**
     * Execute code safely in an isolated Docker container.
     */
    async execute(code, language = 'javascript', options = {}) {
        if (!this.available) {
            return {
                success: false,
                error: 'Docker not available — code execution is disabled'
            };
        }

        const executionOptions = {
            timeout: options.timeout || this.timeout,
            memoryLimit: options.memoryLimit || this.memoryLimit,
            ...options
        };

        return await this.executeInDocker(code, language, executionOptions);
    }

    /**
     * Execute in Docker container via sandboxSecurity.js.
     * Containers are always cleaned up (finally block).
     */
    async executeInDocker(code, language, options) {
        const userId = options.userId || 'system';
        const workspaceId = options.workspaceId || 'default';

        try {
            const container = await sandboxSecurity.createIsolatedContainer(userId, workspaceId);

            // Use exec form (no shell) to prevent shell injection.
            // Pass code directly to the language interpreter.
            const execCmd = this.getDockerExecCmd(language, code);
            await container.update({ Cmd: execCmd });
            await container.start();

            const startTime = Date.now();
            const result = await Promise.race([
                container.wait(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Execution timeout')), options.timeout)
                )
            ]);

            const executionTime = Date.now() - startTime;

            const logs = await container.logs({ stdout: true, stderr: true });

            return {
                success: result.StatusCode === 0,
                output: logs.toString(),
                exitCode: result.StatusCode,
                executionTime
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            // Always clean up — prevents container leaks on timeout or error
            try {
                await sandboxSecurity.cleanupContainer(userId);
            } catch (_) {}
        }
    }

    /**
     * Get exec-form command (no shell) to prevent injection.
     * Returns array like ['node', '-e', code] instead of shell string.
     * For Go/Rust: writes code to /tmp file first to avoid shell interpolation.
     */
    getDockerExecCmd(language, code) {
        // Safe code writing: use base64 encoding to avoid all shell interpretation
        const b64 = Buffer.from(code).toString('base64');

        const commands = {
            javascript: ['node', '-e', code],
            js: ['node', '-e', code],
            python: ['python', '-c', code],
            java: ['java', '-'],
            // Go: decode base64 to file, then run — no shell interpolation of user code
            go: ['sh', '-c', `echo ${b64} | base64 -d > /tmp/main.go && go run /tmp/main.go`],
            // Rust: decode base64 to file, then compile and run — no shell interpolation
            rust: ['sh', '-c', `echo ${b64} | base64 -d > /tmp/main.rs && rustc -o /tmp/out /tmp/main.rs && /tmp/out`],
            ruby: ['ruby', '-e', code],
            php: ['php', '-r', code]
        };

        return commands[language.toLowerCase()] || ['node', '-e', code];
    }

    /**
     * Get Docker image for language.
     */
    getDockerImage(language) {
        const images = {
            javascript: 'node:18-alpine',
            js: 'node:18-alpine',
            python: 'python:3.11-alpine',
            java: 'openjdk:17-alpine',
            go: 'golang:1.21-alpine',
            rust: 'rust:1.75-alpine',
            ruby: 'ruby:3.2-alpine',
            php: 'php:8.2-alpine'
        };

        return images[language.toLowerCase()] || 'node:18-alpine';
    }

    /**
     * Get Docker command for language.
     */
    getDockerCommand(language, code) {
        const commands = {
            javascript: ['node', '-e', code],
            js: ['node', '-e', code],
            python: ['python', '-c', code],
            java: ['java', '-'],
            go: ['go', 'run', '-'],
            rust: ['rustc', '-'],
            ruby: ['ruby', '-e', code],
            php: ['php', '-r', code]
        };

        return commands[language.toLowerCase()] || ['node', '-e', code];
    }

    /**
     * Execute tests in an isolated container.
     */
    async executeTests(testCode, language = 'javascript', framework = 'jest') {
        const testEnvironment = this.prepareTestEnvironment(framework);
        const fullCode = `${testEnvironment}\n${testCode}`;

        return await this.execute(fullCode, language, {
            timeout: 30000 // Tests get more time
        });
    }

    /**
     * Prepare test environment (mock test framework functions).
     */
    prepareTestEnvironment(framework) {
        const environments = {
            jest: `
                const describe = (name, fn) => { console.log('Suite:', name); fn(); };
                const it = (name, fn) => { console.log('Test:', name); fn(); };
                const test = it;
                const expect = (actual) => ({
                    toBe: (expected) => {
                        if (actual !== expected) throw new Error(\`Expected \${expected}, got \${actual}\`);
                    },
                    toEqual: (expected) => {
                        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                            throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
                        }
                    },
                    toBeGreaterThan: (expected) => {
                        if (actual <= expected) throw new Error(\`Expected > \${expected}, got \${actual}\`);
                    }
                });
            `,
            mocha: `
                const describe = (name, fn) => { console.log('Suite:', name); fn(); };
                const it = (name, fn) => { console.log('Test:', name); fn(); };
            `
        };

        return environments[framework] || environments.jest;
    }

    /**
     * Validate code before execution.
     *
     * NOTE: This is a defense-in-depth pre-filter for accidental misuse,
     * NOT a security control. Real isolation comes from Docker containers.
     * Regex blocklists are trivially bypassable.
     */
    validateCode(code, language) {
        const dangerousPatterns = [
            /require\s*\(\s*['"]fs['"]\s*\)/,
            /require\s*\(\s*['"]child_process['"]\s*\)/,
            /require\s*\(\s*['"]net['"]\s*\)/,
            /eval\s*\(/,
            /Function\s*\(/,
            /process\.exit/,
            /process\.env/
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                return {
                    valid: false,
                    error: `Dangerous pattern detected: ${pattern.source}`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Get sandbox statistics.
     */
    getStats() {
        return {
            backend: this.available ? 'docker' : 'none',
            timeout: this.timeout,
            memoryLimit: this.memoryLimit,
            available: this.available
        };
    }
}

module.exports = new SandboxExecutor();
