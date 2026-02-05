/**
 * Sandbox Executor
 * 
 * Provides safe code execution environment for the AI agent.
 * Supports multiple backends:
 * - VM2 (Node.js sandbox) - Default
 * - Docker (Isolated containers) - Production
 * - WebAssembly (Browser-based) - Future
 */

class SandboxExecutor {
    constructor() {
        this.backend = process.env.SANDBOX_BACKEND || 'vm2'; // vm2, docker, wasm
        this.timeout = parseInt(process.env.SANDBOX_TIMEOUT) || 5000; // 5 seconds
        this.memoryLimit = parseInt(process.env.SANDBOX_MEMORY_LIMIT) || 128; // 128MB
        this.initialize();
    }

    initialize() {
        switch (this.backend) {
            case 'docker':
                this.initializeDocker();
                break;
            case 'wasm':
                this.initializeWasm();
                break;
            default:
                this.initializeVM2();
        }
        
        console.log(`✓ Sandbox Executor initialized with ${this.backend} backend`);
    }

    /**
     * VM2 Sandbox (Node.js)
     * Lightweight, quick setup, limited to JavaScript
     */
    initializeVM2() {
        try {
            const { VM } = require('vm2');
            this.VM = VM;
            this.backend = 'vm2';
        } catch (error) {
            console.warn('⚠️ VM2 not installed, code execution disabled');
            console.warn('Install with: npm install vm2');
            this.backend = 'none';
        }
    }

    /**
     * Docker Sandbox (Production)
     * Isolated containers, resource limits, multi-language support
     */
    initializeDocker() {
        try {
            const Docker = require('dockerode');
            this.docker = new Docker();
            this.backend = 'docker';
        } catch (error) {
            console.warn('⚠️ Docker not available, falling back to VM2');
            this.initializeVM2();
        }
    }

    /**
     * WebAssembly Sandbox (Future)
     * Browser-based, no server resources
     */
    initializeWasm() {
        console.warn('⚠️ WASM sandbox not yet implemented, falling back to VM2');
        this.initializeVM2();
    }

    /**
     * Execute code safely
     */
    async execute(code, language = 'javascript', options = {}) {
        const executionOptions = {
            timeout: options.timeout || this.timeout,
            memoryLimit: options.memoryLimit || this.memoryLimit,
            ...options
        };

        switch (this.backend) {
            case 'docker':
                return await this.executeInDocker(code, language, executionOptions);
            case 'vm2':
                return await this.executeInVM2(code, language, executionOptions);
            default:
                return {
                    success: false,
                    error: 'No sandbox backend available'
                };
        }
    }

    /**
     * Execute in VM2 sandbox
     */
    async executeInVM2(code, language, options) {
        if (language !== 'javascript' && language !== 'js') {
            return {
                success: false,
                error: `VM2 only supports JavaScript, got: ${language}`
            };
        }

        try {
            const vm = new this.VM({
                timeout: options.timeout,
                sandbox: {
                    console: {
                        log: (...args) => {
                            this.capturedOutput.push(args.join(' '));
                        },
                        error: (...args) => {
                            this.capturedErrors.push(args.join(' '));
                        }
                    }
                }
            });

            this.capturedOutput = [];
            this.capturedErrors = [];

            const result = vm.run(code);

            return {
                success: true,
                output: this.capturedOutput.join('\n'),
                errors: this.capturedErrors.join('\n'),
                result: result !== undefined ? String(result) : undefined,
                executionTime: 0 // VM2 doesn't provide timing
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    /**
     * Execute in Docker container
     */
    async executeInDocker(code, language, options) {
        try {
            // Select appropriate Docker image
            const image = this.getDockerImage(language);
            
            // Create container
            const container = await this.docker.createContainer({
                Image: image,
                Cmd: this.getDockerCommand(language, code),
                HostConfig: {
                    Memory: options.memoryLimit * 1024 * 1024, // Convert MB to bytes
                    NetworkMode: 'none', // No network access
                    ReadonlyRootfs: true // Read-only filesystem
                },
                AttachStdout: true,
                AttachStderr: true
            });

            // Start container
            await container.start();

            // Wait for execution with timeout
            const startTime = Date.now();
            const result = await Promise.race([
                container.wait(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Execution timeout')), options.timeout)
                )
            ]);

            const executionTime = Date.now() - startTime;

            // Get output
            const logs = await container.logs({
                stdout: true,
                stderr: true
            });

            // Cleanup
            await container.remove();

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
        }
    }

    /**
     * Get Docker image for language
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
     * Get Docker command for language
     */
    getDockerCommand(language, code) {
        // Write code to temp file and execute
        const commands = {
            javascript: ['node', '-e', code],
            js: ['node', '-e', code],
            python: ['python', '-c', code],
            java: ['java', '-'], // Requires compilation
            go: ['go', 'run', '-'],
            rust: ['rustc', '-'], // Requires compilation
            ruby: ['ruby', '-e', code],
            php: ['php', '-r', code]
        };

        return commands[language.toLowerCase()] || ['node', '-e', code];
    }

    /**
     * Execute tests
     */
    async executeTests(testCode, language = 'javascript', framework = 'jest') {
        // Prepare test environment
        const testEnvironment = this.prepareTestEnvironment(framework);
        
        // Combine test code with environment
        const fullCode = `${testEnvironment}\n${testCode}`;
        
        // Execute
        return await this.execute(fullCode, language, {
            timeout: 30000 // Tests get more time
        });
    }

    /**
     * Prepare test environment
     */
    prepareTestEnvironment(framework) {
        const environments = {
            jest: `
                // Mock Jest functions
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
                // Mock Mocha functions
                const describe = (name, fn) => { console.log('Suite:', name); fn(); };
                const it = (name, fn) => { console.log('Test:', name); fn(); };
            `
        };

        return environments[framework] || environments.jest;
    }

    /**
     * Validate code before execution
     */
    validateCode(code, language) {
        // Check for dangerous patterns
        const dangerousPatterns = [
            /require\s*\(\s*['"]fs['"]\s*\)/,  // File system access
            /require\s*\(\s*['"]child_process['"]\s*\)/, // Process execution
            /require\s*\(\s*['"]net['"]\s*\)/, // Network access
            /eval\s*\(/,                        // Eval
            /Function\s*\(/,                    // Function constructor
            /process\.exit/,                    // Process exit
            /process\.env/                      // Environment variables
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
     * Get sandbox statistics
     */
    getStats() {
        return {
            backend: this.backend,
            timeout: this.timeout,
            memoryLimit: this.memoryLimit,
            available: this.backend !== 'none'
        };
    }
}

module.exports = new SandboxExecutor();
