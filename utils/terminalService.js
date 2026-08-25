/**
 * Terminal Service - Interactive PTY Terminal
 * Provides real terminal access with command execution
 * Secure, sandboxed environment for code execution
 */

const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const CodeFile = require('../models/CodeFile');
const vfs = require('./virtualFileSystem');
const { emitWorkspaceChange } = require('./realTimeEvents');

class TerminalService {
  constructor() {
    this.terminals = new Map(); // sessionId -> terminal instance
    this.workspaces = new Map(); // sessionId -> workspace path
    this.watchers = new Map(); // sessionId -> fs watcher
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
   * Sync a file created in terminal to the CodeFile model
   */
  async syncFileToVFS(sessionId, filePath, workspaceId, userId) {
    try {
      const terminal = this.terminals.get(sessionId);
      if (!terminal) return;
      
      const relativePath = path.relative(terminal.workspacePath, filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const langMap = {
        '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.java': 'java',
        '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown',
        '.go': 'go', '.rs': 'rust', '.cpp': 'cpp', '.c': 'c',
        '.php': 'php', '.rb': 'ruby', '.sh': 'shell', '.sql': 'sql'
      };
      
      // Check if file already exists in DB
      const existing = await CodeFile.findOne({
        company: workspaceId,
        path: '/' + relativePath.replace(/\\/g, '/')
      });
      
      if (!existing) {
        let content = '';
        try {
          content = await fs.readFile(filePath, 'utf8');
        } catch (e) {
          content = '';
        }
        
        const codeFile = await CodeFile.create({
          name: fileName,
          language: langMap[ext] || 'text',
          content,
          company: workspaceId,
          path: '/' + relativePath.replace(/\\/g, '/'),
          createdBy: userId,
          lastModifiedBy: userId
        });
        
        // Update VFS index
        const vfs = require('./virtualFileSystem');
        const index = vfs.indexes.get(workspaceId);
        if (index) {
          index.set(codeFile.path, {
            id: codeFile._id.toString(),
            name: codeFile.name,
            path: codeFile.path,
            size: codeFile.size,
            language: codeFile.language,
            lastModified: codeFile.updatedAt,
            createdBy: codeFile.createdBy
          });
        }
        
        // Emit real-time event
        emitWorkspaceChange(workspaceId, 'file:created', {
          file: {
            _id: codeFile._id,
            name: codeFile.name,
            path: codeFile.path,
            language: codeFile.language,
            company: codeFile.company
          }
        });
      }
    } catch (error) {
      console.error('Sync file to VFS error:', error);
    }
  }

  /**
   * Sync a deleted file from terminal to the CodeFile model
   */
  async syncDeletedFileFromVFS(sessionId, filePath, workspaceId) {
    try {
      const terminal = this.terminals.get(sessionId);
      if (!terminal) return;
      
      const relativePath = path.relative(terminal.workspacePath, filePath);
      const vfsPath = '/' + relativePath.replace(/\\/g, '/');
      
      const file = await CodeFile.findOne({
        company: workspaceId,
        path: vfsPath
      });
      
      if (file) {
        await CodeFile.findByIdAndDelete(file._id);
        
        // Update VFS index
        const vfs = require('./virtualFileSystem');
        try {
          await vfs.deleteFile(file._id.toString(), workspaceId);
        } catch (vfsError) {
          console.error('VFS delete error:', vfsError);
        }
        
        // Emit real-time event
        emitWorkspaceChange(workspaceId, 'file:deleted', {
          fileId: file._id.toString(),
          path: vfsPath,
          company: workspaceId
        });
      }
    } catch (error) {
      console.error('Sync deleted file from VFS error:', error);
    }
  }

  /**
   * Watch PTY terminal directory for changes and sync to VFS
   */
  setupDirectoryWatcher(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || terminal.type !== 'pty') return;
    
    try {
      const watcher = fs.watch(terminal.workspacePath, { recursive: true }, async (eventType, filename) => {
        if (!filename) return;
        
        const fullPath = path.join(terminal.workspacePath, filename);
        
        try {
          const stats = await fs.stat(fullPath);
          
          if (eventType === 'rename' || eventType === 'change') {
            if (stats.isFile()) {
              // File created or modified
              const relativePath = path.relative(terminal.workspacePath, fullPath);
              const vfsPath = '/' + relativePath.replace(/\\/g, '/');
              
              // Check if file exists in DB
              const existing = await CodeFile.findOne({
                company: terminal.workspaceId,
                path: vfsPath
              });
              
              if (!existing) {
                // New file - sync it
                await this.syncFileToVFS(sessionId, fullPath, terminal.workspaceId, terminal.userId);
              } else {
                // Existing file - update content
                try {
                  const content = await fs.readFile(fullPath, 'utf8');
                  existing.content = content;
                  existing.updatedAt = new Date();
                  await existing.save();
                  
                  // Update VFS cache
                  const vfs = require('./virtualFileSystem');
                  const cacheKey = `${terminal.workspaceId}:${existing._id}`;
                  vfs.cache.set(cacheKey, existing.toObject());
                  
                  // Emit update event
                  emitWorkspaceChange(terminal.workspaceId, 'file:updated', {
                    file: {
                      _id: existing._id,
                      name: existing.name,
                      path: existing.path,
                      language: existing.language,
                      company: existing.company
                    }
                  });
                } catch (e) {
                  console.error('PTY file sync update error:', e);
                }
              }
            } else if (stats.isDirectory()) {
              // Directory change - invalidate VFS index
              const vfs = require('./virtualFileSystem');
              vfs.invalidateIndex(terminal.workspaceId);
              
              emitWorkspaceChange(terminal.workspaceId, 'folder:changed', {
                path: '/' + path.relative(terminal.workspacePath, fullPath).replace(/\\/g, '/')
              });
            }
          }
        } catch (error) {
          // File might not exist anymore (deleted)
          if (eventType === 'rename') {
            const relativePath = path.relative(terminal.workspacePath, fullPath);
            await this.syncDeletedFileFromVFS(sessionId, fullPath, terminal.workspaceId);
          }
        }
      });
      
      this.watchers.set(sessionId, watcher);
    } catch (error) {
      console.error('Failed to setup directory watcher:', error);
    }
  }

  /**
   * Create a new terminal session
   */
  async createTerminal(userId, workspaceId, options = {}) {
    const { assertValidWorkspaceId } = require('./sanitize');
    assertValidWorkspaceId(workspaceId);

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
      // Simulated terminal (fallback) - virtual VFS-backed cwd
      this.terminals.set(sessionId, {
        type: 'simulated',
        workspacePath,
        userId,
        workspaceId,
        history: [],
        cwd: '/',
        createdAt: Date.now()
      });

      console.log(`✓ Simulated terminal created: ${sessionId}`);
    }

    // Sync VFS tree to PTY workspace directory so ls shows editor files immediately
    if (this.usePty) {
      await this.syncVfsToPty(sessionId);
    }

    // Setup directory watcher for PTY terminals
    if (this.usePty) {
      this.setupDirectoryWatcher(sessionId);
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
      const [cmd, ...args] = command.split(' ');

      let output = '';

      switch (cmd) {
        case 'pwd':
          output = terminal.cwd + '\n';
          break;

        case 'ls':
        case 'dir':
          try {
            const tree = await vfs.getTree(terminal.workspaceId);
            const node = this.getVfsNode(tree, terminal.cwd);
            if (!node || !node.children || Object.keys(node.children).length === 0) {
              output = '\n';
            } else {
              output = Object.values(node.children).map(child => child.name).join('\n') + '\n';
            }
          } catch (error) {
            output = `Error: ${error.message}\n`;
          }
          break;

        case 'cd':
          if (args.length > 0) {
            const target = args[0];
            if (target === '..') {
              const parts = terminal.cwd.split('/').filter(p => p);
              parts.pop();
              terminal.cwd = parts.length === 0 ? '/' : '/' + parts.join('/');
              output = '';
            } else if (target === '/' || target === '') {
              terminal.cwd = '/';
              output = '';
            } else {
              const newPath = terminal.cwd === '/' ? `/${target}` : `${terminal.cwd}/${target}`;
              try {
                const tree = await vfs.getTree(terminal.workspaceId);
                const node = this.getVfsNode(tree, newPath);
                if (node && node.type === 'directory') {
                  terminal.cwd = newPath;
                  output = '';
                } else {
                  output = `cd: ${target}: No such file or directory\n`;
                }
              } catch (error) {
                output = `cd: ${target}: No such file or directory\n`;
              }
            }
          }
          break;

        case 'mkdir':
          if (args.length > 0) {
            const folderPath = terminal.cwd === '/' ? `/${args[0]}` : `${terminal.cwd}/${args[0]}`;
            try {
              const file = await vfs.createFile({
                name: '.gitkeep',
                language: 'text',
                content: '',
                path: folderPath,
                company: terminal.workspaceId,
                project: null,
                createdBy: terminal.userId,
                lastModifiedBy: terminal.userId
              }, terminal.workspaceId);

              emitWorkspaceChange(terminal.workspaceId, 'folder:changed', {
                path: folderPath,
                company: terminal.workspaceId
              });

              output = '';
            } catch (error) {
              output = `mkdir: ${error.message}\n`;
            }
          }
          break;

        case 'touch':
          if (args.length > 0) {
            const fileName = path.basename(args[0]);
            const filePath = terminal.cwd === '/' ? `/${fileName}` : `${terminal.cwd}/${fileName}`;
            try {
              const file = await vfs.createFile({
                name: fileName,
                language: 'text',
                content: '',
                path: filePath,
                company: terminal.workspaceId,
                project: null,
                createdBy: terminal.userId,
                lastModifiedBy: terminal.userId
              }, terminal.workspaceId);

              emitWorkspaceChange(terminal.workspaceId, 'file:created', {
                file: {
                  _id: file._id,
                  name: file.name,
                  path: file.path,
                  language: file.language,
                  company: file.company
                }
              });

              output = '';
            } catch (error) {
              output = `touch: ${error.message}\n`;
            }
          }
          break;

        case 'rm':
          if (args.length > 0) {
            const targetName = path.basename(args[0]);
            const targetPath = terminal.cwd === '/' ? `/${targetName}` : `${terminal.cwd}/${targetName}`;
            try {
              let index = vfs.indexes.get(terminal.workspaceId);
              if (!index) {
                await vfs.buildIndex(terminal.workspaceId);
                index = vfs.indexes.get(terminal.workspaceId);
              }

              const filesToDelete = [];
              index.forEach((metadata, p) => {
                if (p === targetPath || p.startsWith(targetPath + '/')) {
                  filesToDelete.push(metadata);
                }
              });

              if (filesToDelete.length === 0) {
                output = `rm: ${args[0]}: No such file or directory\n`;
              } else {
                for (const file of filesToDelete) {
                  await vfs.deleteFile(file.id, terminal.workspaceId);
                  emitWorkspaceChange(terminal.workspaceId, 'file:deleted', {
                    fileId: file.id,
                    path: file.path,
                    company: terminal.workspaceId
                  });
                }
                output = '';
              }
            } catch (error) {
              output = `rm: ${error.message}\n`;
            }
          }
          break;

        case 'cat':
          if (args.length > 0) {
            const targetPath = terminal.cwd === '/' ? `/${args[0]}` : `${terminal.cwd}/${args[0]}`;
            try {
              const file = await vfs.readFileByPath(targetPath, terminal.workspaceId);
              output = (file.content || '') + '\n';
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
  rm        - Remove file or directory
  cat       - Display file content
  echo      - Print text
  clear     - Clear terminal
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

  getVfsNode(tree, virtualPath) {
    if (!virtualPath || virtualPath === '/') return tree;
    const parts = virtualPath.split('/').filter(p => p);
    let current = tree;
    for (const part of parts) {
      if (current.children && current.children[part]) {
        current = current.children[part];
      } else {
        return null;
      }
    }
    return current;
  }

  async syncVfsToPty(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || terminal.type !== 'pty') return;

    let index = vfs.indexes.get(terminal.workspaceId);
    if (!index) {
      await vfs.buildIndex(terminal.workspaceId);
      index = vfs.indexes.get(terminal.workspaceId);
    }
    if (!index) return;

    const CodeFile = require('../models/CodeFile');

    for (const [vfsPath, metadata] of index) {
      try {
        const file = await CodeFile.findById(metadata.id).select('content').lean();
        if (!file) continue;

        const relativePath = vfsPath.replace(/^\//, '');
        const fsPath = path.join(terminal.workspacePath, relativePath);
        const dir = path.dirname(fsPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fsPath, file.content || '');
      } catch (error) {
        console.error(`Failed to sync file ${metadata.path} to PTY:`, error);
      }
    }
  }

  async applyPtyDelta(sessionId, event, data) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || terminal.type !== 'pty') return;

    const CodeFile = require('../models/CodeFile');

    try {
      switch (event) {
        case 'file:created': {
          const vfsPath = data.file.path;
          const relativePath = vfsPath.replace(/^\//, '');
          const fsPath = path.join(terminal.workspacePath, relativePath);
          const dir = path.dirname(fsPath);
          await fs.mkdir(dir, { recursive: true });

          const file = await CodeFile.findById(data.file._id).select('content').lean();
          if (file) {
            await fs.writeFile(fsPath, file.content || '');
          }
          break;
        }
        case 'file:updated': {
          const vfsPath = data.file.path;
          const relativePath = vfsPath.replace(/^\//, '');
          const fsPath = path.join(terminal.workspacePath, relativePath);
          const file = await CodeFile.findById(data.file._id).select('content').lean();
          if (file) {
            await fs.writeFile(fsPath, file.content || '');
          }
          break;
        }
        case 'file:deleted': {
          const vfsPath = data.path;
          const relativePath = vfsPath.replace(/^\//, '');
          const fsPath = path.join(terminal.workspacePath, relativePath);
          try {
            await fs.unlink(fsPath);
          } catch (e) {
            // File might not exist in PTY dir
          }
          break;
        }
        case 'folder:changed': {
          // no-op per plan
          break;
        }
      }
    } catch (error) {
      console.error(`PTY delta error for session ${sessionId}:`, error);
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

    // Clean up watcher
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
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

// Cleanup old sessions every 30 minutes (store interval for cleanup)
if (process.env.NODE_ENV !== 'test') {
  terminalService._cleanupInterval = setInterval(() => {
    terminalService.cleanupOldSessions();
  }, 30 * 60 * 1000);
} else {
  terminalService._cleanupInterval = null;
}

// Provide a stop function for tests to clear the interval
terminalService.stopCleanup = function() {
  if (this._cleanupInterval) {
    clearInterval(this._cleanupInterval);
    this._cleanupInterval = null;
  }
};

module.exports = terminalService;
