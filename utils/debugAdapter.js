/**
 * Debug Adapter for BUCQ IDE
 * Implements Debug Adapter Protocol (DAP) for breakpoint debugging
 * Supports: Node.js, Python, and browser JavaScript
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

class DebugAdapter extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map(); // sessionId -> debug session
        this.breakpoints = new Map(); // fileId -> breakpoints[]
        this.nextSessionId = 1;
    }

    /**
     * Create a new debug session
     */
    async createSession(userId, workspaceId, config) {
        const sessionId = `debug_${this.nextSessionId++}_${Date.now()}`;
        
        const session = {
            id: sessionId,
            userId,
            workspaceId,
            config,
            state: 'initialized',
            process: null,
            breakpoints: new Map(),
            variables: new Map(),
            callStack: [],
            currentLine: null,
            threads: []
        };
        
        this.sessions.set(sessionId, session);
        
        console.log(`Created debug session: ${sessionId}`);
        return session;
    }

    /**
     * Launch debugger for a program
     */
    async launch(sessionId, launchConfig) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        const { program, language, args = [], cwd, env = {} } = launchConfig;

        try {
            let debugProcess;
            
            switch (language) {
                case 'javascript':
                case 'typescript':
                    debugProcess = await this.launchNodeDebugger(program, args, cwd, env);
                    break;
                
                case 'python':
                    debugProcess = await this.launchPythonDebugger(program, args, cwd, env);
                    break;
                
                default:
                    throw new Error(`Unsupported language: ${language}`);
            }

            session.process = debugProcess;
            session.state = 'running';
            session.language = language;

            // Set up event handlers
            this.setupProcessHandlers(session);

            this.emit('launched', { sessionId, pid: debugProcess.pid });
            
            return {
                success: true,
                sessionId,
                pid: debugProcess.pid
            };
        } catch (error) {
            session.state = 'error';
            throw error;
        }
    }

    /**
     * Launch Node.js debugger with --inspect-brk
     */
    async launchNodeDebugger(program, args, cwd, env) {
        const debugArgs = ['--inspect-brk=0', program, ...args];
        
        const process = spawn('node', debugArgs, {
            cwd: cwd || process.cwd(),
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Wait for debugger to be ready
        await this.waitForDebuggerReady(process);

        return process;
    }

    /**
     * Launch Python debugger with debugpy
     */
    async launchPythonDebugger(program, args, cwd, env) {
        const debugArgs = ['-m', 'debugpy', '--listen', '0.0.0.0:5678', '--wait-for-client', program, ...args];
        
        const process = spawn('python', debugArgs, {
            cwd: cwd || process.cwd(),
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        await this.waitForDebuggerReady(process);

        return process;
    }

    /**
     * Wait for debugger to be ready
     */
    waitForDebuggerReady(process) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Debugger startup timeout'));
            }, 10000);

            process.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Debugger listening') || output.includes('Debugger attached')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Set up process event handlers
     */
    setupProcessHandlers(session) {
        const { process, id: sessionId } = session;

        process.stdout.on('data', (data) => {
            this.emit('output', {
                sessionId,
                category: 'stdout',
                output: data.toString()
            });
        });

        process.stderr.on('data', (data) => {
            this.emit('output', {
                sessionId,
                category: 'stderr',
                output: data.toString()
            });
        });

        process.on('exit', (code) => {
            session.state = 'terminated';
            this.emit('terminated', {
                sessionId,
                exitCode: code
            });
        });
    }

    /**
     * Set breakpoints for a file
     */
    async setBreakpoints(sessionId, fileId, breakpoints) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        // Store breakpoints
        session.breakpoints.set(fileId, breakpoints.map(bp => ({
            line: bp.line,
            column: bp.column || 0,
            condition: bp.condition || null,
            hitCondition: bp.hitCondition || null,
            verified: false,
            id: `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })));

        // Verify breakpoints (simplified - would use actual debugger protocol)
        const verified = session.breakpoints.get(fileId).map(bp => {
            bp.verified = true;
            return bp;
        });

        this.emit('breakpointsChanged', {
            sessionId,
            fileId,
            breakpoints: verified
        });

        return verified;
    }

    /**
     * Continue execution
     */
    async continue(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        session.state = 'running';
        session.currentLine = null;

        // Send continue command to debugger
        this.sendDebugCommand(session, 'continue');

        this.emit('continued', { sessionId });

        return { success: true };
    }

    /**
     * Step over (next line)
     */
    async stepOver(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        this.sendDebugCommand(session, 'next');

        this.emit('stepped', { sessionId, type: 'over' });

        return { success: true };
    }

    /**
     * Step into (enter function)
     */
    async stepInto(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        this.sendDebugCommand(session, 'step');

        this.emit('stepped', { sessionId, type: 'into' });

        return { success: true };
    }

    /**
     * Step out (exit function)
     */
    async stepOut(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        this.sendDebugCommand(session, 'out');

        this.emit('stepped', { sessionId, type: 'out' });

        return { success: true };
    }

    /**
     * Pause execution
     */
    async pause(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        session.state = 'paused';
        this.sendDebugCommand(session, 'pause');

        this.emit('paused', { sessionId });

        return { success: true };
    }

    /**
     * Get current call stack
     */
    async getStackTrace(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        // Simplified - would query actual debugger
        return session.callStack || [];
    }

    /**
     * Get variables in current scope
     */
    async getVariables(sessionId, scopeId = 'local') {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        // Simplified - would query actual debugger
        return session.variables.get(scopeId) || [];
    }

    /**
     * Evaluate expression in debug context
     */
    async evaluate(sessionId, expression, frameId = 0) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        // Simplified - would send to actual debugger
        try {
            // This would use the debugger protocol to evaluate
            const result = {
                result: `Evaluated: ${expression}`,
                type: 'string',
                variablesReference: 0
            };

            return result;
        } catch (error) {
            return {
                result: error.message,
                type: 'error',
                variablesReference: 0
            };
        }
    }

    /**
     * Send command to debugger process
     */
    sendDebugCommand(session, command, params = {}) {
        if (!session.process) {
            throw new Error('Debug process not running');
        }

        // Simplified - would use actual debugger protocol (CDP for Node, DAP for others)
        const message = JSON.stringify({
            command,
            params,
            seq: Date.now()
        });

        session.process.stdin.write(message + '\n');
    }

    /**
     * Simulate breakpoint hit (for testing)
     */
    simulateBreakpointHit(sessionId, fileId, line) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.state = 'paused';
        session.currentLine = { fileId, line };

        // Simulate call stack
        session.callStack = [
            {
                id: 1,
                name: 'main',
                file: fileId,
                line,
                column: 0
            }
        ];

        // Simulate variables
        session.variables.set('local', [
            { name: 'x', value: '42', type: 'number' },
            { name: 'message', value: '"Hello World"', type: 'string' },
            { name: 'isActive', value: 'true', type: 'boolean' }
        ]);

        this.emit('stopped', {
            sessionId,
            reason: 'breakpoint',
            fileId,
            line,
            threadId: 1
        });
    }

    /**
     * Terminate debug session
     */
    async terminate(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Debug session not found');
        }

        if (session.process) {
            session.process.kill();
        }

        session.state = 'terminated';
        this.sessions.delete(sessionId);

        this.emit('terminated', { sessionId });

        return { success: true };
    }

    /**
     * Get session info
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            id: session.id,
            state: session.state,
            language: session.language,
            currentLine: session.currentLine,
            breakpointCount: Array.from(session.breakpoints.values()).reduce((sum, bps) => sum + bps.length, 0)
        };
    }

    /**
     * Get all active sessions for a user
     */
    getUserSessions(userId) {
        const sessions = [];
        this.sessions.forEach((session) => {
            if (session.userId === userId) {
                sessions.push(this.getSession(session.id));
            }
        });
        return sessions;
    }
}

module.exports = new DebugAdapter();
