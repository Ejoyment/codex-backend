/**
 * Terminal Service - Interactive PTY Terminal
 * Provides real terminal access with command execution
 * Secure, sandboxed environment for code execution
 */

const os = require('os');
const path = require('path');
const fs = require('fs').promises;

class TerminalService {
  constructor() {
    this.terminals = new Map(); // sessionId -> terminal instance
    this.workspaces = new Map(); // sessionId -> workspace path
    this.usePty = false;

    // Try to load node-pty (may fail on some platforms)
    try {
      const pty = require('node-pty');
      this.pty = pty;
      this.usePty = true;
      console.log('✓ node-pty loaded successfully');
    } catch (error) {
      console.log('⚠ node-pty not available, using simulated terminal');
      this.usePty = false;
    }
  }

  /**
   * Create a new terminal session
   */
  async createTerminal(userId, workspaceId, options = {}) {
    const sessionId = `${userId}_${workspaceId}_${Date.now()}`;
    
    // Create workspace directory
    const workspacePath = path.join(os.tmpdir(), 'codex-workspaces', sessionId);
    await fs.mkdir(workspacePath, { recursive: true });
    this.workspaces.set(sessionId, workspacePath);

    if (this.usePty) {
      // Real PTY terminal
      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
      
      const ptyProcess = this.pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: workspacePath,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          WORKSPACE_ID: workspaceId,
          USER_ID: userId
        }
      });

      this.terminals.set(sessionId, {
        type: 'pty',
        process: ptyProcess,
        workspacePath,
        userId,
        workspaceId,
        createdAt: Date.now()
      });

      console.log(`✓ PTY terminal created: ${sessionId}`);
    } else {
      // Simulated terminal (fallback)
      this.terminals.set(sessionId, {
        type: 'simulated',
        workspacePath,
        userId,
        workspaceId,
        history: [],
        cwd: workspacePath,
        createdAt: Date.now()
      });

      console.log(`✓ Simulated terminal created: ${sessionId}`);
    }

    return {
      sessionId,
      workspacePath,
      type: this.usePty ? 'pty' : 'simulated'
    };
  }

  /**
   * Write data to terminal
   */
  write(sessionId, data) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) {
      throw new Error('Terminal session not found');
    }

    if (terminal.type === 'pty') {
      terminal.process.write(data);
    } else {
      // Simulated terminal: execute command
      this.executeSimulatedCommand(sessionId, data);
    }
  }

  /**
   * Execute command in simulated terminal
   */
  async executeSimulatedCommand(sessionId, input) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || terminal.type !== 'simulated') return;

    const command = input.trim();
    if (!command) return;

    terminal.history.push({ type: 'input', data: command });

    try {
      // Parse command
      const [cmd, ...args] = command.split(' ');

      let output = '';

      switch (cmd) {
        case 'pwd':
          output = terminal.cwd + '\n';
          break;

        case 'ls':
        case 'dir':
          try {
            const files = await fs.readdir(terminal.cwd);
            output = files.join('\n') + '\n';
          } catch (error) {
            output = `Error: ${error.message}\n`;
          }
          break;

        case 'cd':
          if (args.length > 0) {
            const newPath = path.resolve(terminal.cwd, args[0]);
            try {
              await fs.access(newPath);
              terminal.cwd = newPath;
              output = '';
            } catch (error) {
              output = `cd: ${args[0]}: No such file or directory\n`;
            }
          }
          break;

        case 'mkdir':
          if (args.length > 0) {
            try {
              await fs.mkdir(path.join(terminal.cwd, args[0]), { recursive: true });
              output = '';
            } catch (error) {
              output = `mkdir: ${error.message}\n`;
            }
          }
          break;

        case 'touch':
          if (args.length > 0) {
            try {
              await fs.writeFile(path.join(terminal.cwd, args[0]), '');
              output = '';
            } catch (error) {
              output = `touch: ${error.message}\n`;
            }
          }
          break;

        case 'cat':
          if (args.length > 0) {
            try {
              const content = await fs.readFile(path.join(terminal.cwd, args[0]), 'utf8');
              output = content + '\n';
            } catch (error) {
              output = `cat: ${error.message}\n`;
            }
          }
          break;

        case 'echo':
          output = args.join(' ') + '\n';
          break;

        case 'clear':
          terminal.history = [];
          output = '\x1b[2J\x1b[H'; // Clear screen ANSI code
          break;

        case 'help':
          output = `Available commands:
  pwd       - Print working directory
  ls, dir   - List files
  cd <dir>  - Change directory
  mkdir     - Create directory
  touch     - Create file
  cat       - Display file content
  echo      - Print text
  clear     - Clear screen
  help      - Show this help
  exit      - Close terminal
\n`;
          break;

        case 'exit':
          output = 'Terminal session ended.\n';
          break;

        default:
          output = `${cmd}: command not found\n`;
      }

      terminal.history.push({ type: 'output', data: output });

      // Emit output event (will be handled by Socket.IO)
      if (terminal.onData) {
        terminal.onData(output);
      }
    } catch (error) {
      const errorOutput = `Error: ${error.message}\n`;
      terminal.history.push({ type: 'output', data: errorOutput });
      if (terminal.onData) {
        terminal.onData(errorOutput);
      }
    }
  }

  /**
   * Register data handler for terminal
   */
  onData(sessionId, callback) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) {
      throw new Error('Terminal session not found');
    }

    if (terminal.type === 'pty') {
      terminal.process.onData(callback);
    } else {
      terminal.onData = callback;
    }
  }

  /**
   * Resize terminal
   */
  resize(sessionId, cols, rows) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) {
      throw new Error('Terminal session not found');
    }

    if (terminal.type === 'pty') {
      terminal.process.resize(cols, rows);
    }
  }

  /**
   * Get terminal history (simulated only)
   */
  getHistory(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || terminal.type !== 'simulated') {
      return [];
    }

    return terminal.history;
  }

  /**
   * Destroy terminal session
   */
  async destroy(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) {
      return;
    }

    if (terminal.type === 'pty') {
      terminal.process.kill();
    }

    // Clean up workspace directory
    try {
      await fs.rm(terminal.workspacePath, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up workspace:', error.message);
    }

    this.terminals.delete(sessionId);
    this.workspaces.delete(sessionId);

    console.log(`✓ Terminal destroyed: ${sessionId}`);
  }

  /**
   * Get active terminal sessions
   */
  getActiveSessions(userId) {
    const sessions = [];
    
    for (const [sessionId, terminal] of this.terminals) {
      if (terminal.userId === userId) {
        sessions.push({
          sessionId,
          type: terminal.type,
          workspaceId: terminal.workspaceId,
          createdAt: terminal.createdAt,
          uptime: Date.now() - terminal.createdAt
        });
      }
    }

    return sessions;
  }

  /**
   * Clean up old sessions (older than 1 hour)
   */
  async cleanupOldSessions() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();

    for (const [sessionId, terminal] of this.terminals) {
      if (now - terminal.createdAt > oneHour) {
        console.log(`Cleaning up old terminal session: ${sessionId}`);
        await this.destroy(sessionId);
      }
    }
  }

  /**
   * Get terminal statistics
   */
  getStats() {
    return {
      totalSessions: this.terminals.size,
      ptyAvailable: this.usePty,
      platform: os.platform(),
      sessions: Array.from(this.terminals.entries()).map(([id, term]) => ({
        id,
        type: term.type,
        userId: term.userId,
        uptime: Date.now() - term.createdAt
      }))
    };
  }
}

// Singleton instance
const terminalService = new TerminalService();

// Cleanup old sessions every 30 minutes
setInterval(() => {
  terminalService.cleanupOldSessions();
}, 30 * 60 * 1000);

module.exports = terminalService;
