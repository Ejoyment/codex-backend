/**
 * Terminal Service - Interactive PTY Terminal
 * Provides real terminal access with command execution
 * Secure, sandboxed environment for code execution
 */

const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const CodeFile = require('../models/CodeFile');
const TerminalLog = require('../models/TerminalLog');
const vfs = require('./virtualFileSystem');
const { emitWorkspaceChange } = require('./realTimeEvents');
const unifiedStateGraph = require('./unifiedStateGraph');
const { VpsShell, terminalTransportEnabled } = require('./vpsShell');

// VFS extension → language id (shared by per-file and bulk workspace sync).
const EXT_LANG_MAP = {
  '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.java': 'java',
  '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown',
  '.go': 'go', '.rs': 'rust', '.cpp': 'cpp', '.c': 'c',
  '.php': 'php', '.rb': 'ruby', '.sh': 'shell', '.sql': 'sql'
};

/**
 * Resolve an untrusted VFS-style path inside a workspace directory.
 * Throws if the normalized path escapes the workspace (path traversal).
 */
function resolveInWorkspace(workspacePath, vfsPath) {
  const p = path.normalize(path.join(workspacePath, String(vfsPath || '').replace(/^\/+/, '')));
  if (p !== workspacePath && !p.startsWith(workspacePath + path.sep)) throw new Error('Path escapes workspace');
  return p;
}

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
   * Persist a terminal log entry to Mongo with a stable reference ID.
   * Returns the refId for cross-platform referencing.
   */
  async _persistEntry(sessionId, type, data) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal || !terminal.logId) return null;

    const entry = { type, data, refId: new mongoose.Types.ObjectId() };
    try {
      await TerminalLog.updateOne(
        { _id: terminal.logId },
        {
          $push: { entries: entry },
          $inc: { commandCount: type === 'input' ? 1 : 0 }
        }
      );
      // Register in unified state graph for cross-platform linking
      unifiedStateGraph.registerTerminalOutput(sessionId, {
        refId: entry.refId,
        type,
        data,
        timestamp: new Date()
      });
      return entry.refId;
    } catch (err) {
      console.warn('Terminal log persist failed:', err.message);
      return null;
    }
  }

  /**
   * Sync a file created in terminal to the CodeFile model
   */
  async syncFileToVFS(sessionId, filePath, workspaceId, userId) {
    try {
      const terminal = this.terminals.get(sessionId);
      if (!terminal) return;

      // Containment: never sync paths outside the session workspace
      resolveInWorkspace(terminal.workspacePath, path.relative(terminal.workspacePath, filePath));

      // Never read symlinked host files into the DB
      try {
        const linkStats = await fs.lstat(filePath);
        if (linkStats.isSymbolicLink()) return;
      } catch (_) {
        // Fall through to existing read handling below
      }
      
      const relativePath = path.relative(terminal.workspacePath, filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const langMap = EXT_LANG_MAP;
      // CodeFiles store the DIRECTORY path + name. The old lookup searched
      // for the full disk path, missed editor-created files, and then
      // re-created them as duplicates with an inverted path shape.
      const relPosix = relativePath.replace(/\\/g, '/');
      const dirPosix = relPosix.includes('/') ? `/${relPosix.slice(0, relPosix.lastIndexOf('/'))}` : '/';
      const fullVfsPath = `/${relPosix}`;
      
      // Check if file already exists in DB (new or legacy full-path shape)
      const existing = await CodeFile.findOne({
        company: workspaceId,
        $or: [
          { path: dirPosix, name: fileName },
          { path: fullVfsPath },
        ],
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
          project: terminal.projectId || undefined,
          path: dirPosix,
          createdBy: userId,
          lastModifiedBy: userId
        });
        
        // Update VFS index
        const vfs = require('./virtualFileSystem');
        const index = vfs.indexes.get(workspaceId);
        if (index) {
          const full = vfs.fullPathOf(codeFile);
          index.set(full, {
            id: codeFile._id.toString(),
            name: codeFile.name,
            path: full,
            dirPath: codeFile.path,
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
      const relPosix = relativePath.replace(/\\/g, '/');
      const vfsPath = `/${relPosix}`;
      const fileName = path.basename(filePath);
      const dirPosix = relPosix.includes('/') ? `/${relPosix.slice(0, relPosix.lastIndexOf('/'))}` : '/';
      
      const file = await CodeFile.findOne({
        company: workspaceId,
        $or: [
          { path: dirPosix, name: fileName },
          { path: vfsPath },
        ],
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
          const stats = await fs.lstat(fullPath);
          if (stats.isSymbolicLink()) return;
          
          if (eventType === 'rename' || eventType === 'change') {
            if (stats.isFile()) {
              // File created or modified
              const relativePath = path.relative(terminal.workspacePath, fullPath);
              const relPosix = relativePath.replace(/\\/g, '/');
              const fileName = path.basename(fullPath);
              const dirPosix = relPosix.includes('/') ? `/${relPosix.slice(0, relPosix.lastIndexOf('/'))}` : '/';
              const fullVfsPath = `/${relPosix}`;
              
              // Check if file exists in DB (dir+name shape, legacy full-path shape)
              const existing = await CodeFile.findOne({
                company: terminal.workspaceId,
                $or: [
                  { path: dirPosix, name: fileName },
                  { path: fullVfsPath },
                ],
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
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(userId))) throw new Error('Invalid userId');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(workspaceId))) throw new Error('Invalid workspaceId format');

    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const sessionId = `${userId}_${workspaceId}_${Date.now()}`;

    // Project scope drives hydration AND is stamped onto files the shell
    // creates — verify it belongs to this user before trusting it, otherwise
    // a client could plant foreign project ids on its CodeFiles.
    let scopedProjectId = null;
    if (options.projectId && mongoose.isValidObjectId(options.projectId)) {
      try {
        const LocalProject = require('../models/LocalProject');
        const owned = await LocalProject.findOne({ _id: options.projectId, userId }).select('_id').lean();
        if (owned) scopedProjectId = String(options.projectId);
      } catch (_) {
        scopedProjectId = null;
      }
    }
    const scopedRepo = (typeof options.repoFullName === 'string' && /^[\w.\-\/]{1,200}$/.test(options.repoFullName))
      ? options.repoFullName
      : null;
    
    // Create workspace directory
    const workspacePath = path.join(os.tmpdir(), 'codex-workspaces', sessionId);
    await fs.mkdir(workspacePath, { recursive: true });
    this.workspaces.set(sessionId, workspacePath);

    if (this.usePty) {
      if (terminalTransportEnabled()) {
        // Remote PTY: ssh → docker exec in a VPS toolbox container. The shell
        // implements the node-pty subset (write/resize/kill/onData) so the
        // rest of this service treats it exactly like a local pty.
        const shell = new VpsShell({
          sessionId,
          workspaceId,
          userId,
          cols: options.cols || 80,
          rows: options.rows || 24,
          workspacePath,
        });
        this.terminals.set(sessionId, {
          type: 'pty',
          process: shell,
          vps: true,
          workspacePath,
          userId,
          workspaceId,
          projectId: scopedProjectId,
          repoFullName: scopedRepo,
          token: sessionToken,
          createdAt: Date.now()
        });
        console.log(`✓ VPS terminal queued: ${sessionId}`);
      } else {
      // Real PTY terminal
      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
      
      const ptyProcess = this.pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: workspacePath,
        env: (() => {
          const safeEnv = {};
          for (const k of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'USER', 'SHELL', 'TMPDIR']) {
            if (process.env[k] !== undefined) safeEnv[k] = process.env[k];
          }
          safeEnv.TERM = 'xterm-256color';
          safeEnv.WORKSPACE_ID = workspaceId;
          safeEnv.USER_ID = userId;
          if (scopedProjectId) safeEnv.PROJECT_ID = scopedProjectId;
          if (scopedRepo) safeEnv.REPO = scopedRepo;
          // Project-aware prompt: cwd basename + current git branch, so the
          // shell says WHERE it is instead of a random temp path.
          safeEnv.PS1 = '\\[\\e[36m\\]\\w\\[\\e[0m\\] \\[\\e[33m\\]$(git rev-parse --abbrev-ref HEAD 2>/dev/null | sed -e "s/^/(/" -e "s/$/)/")\\[\\e[0m\\] \\[\\e[32m\\]\\$ \\[\\e[0m\\]';
          return safeEnv;
        })()
      });

      this.terminals.set(sessionId, {
        type: 'pty',
        process: ptyProcess,
        workspacePath,
        userId,
        workspaceId,
        projectId: options.projectId || null,
        repoFullName: options.repoFullName || null,
        token: sessionToken,
        createdAt: Date.now()
      });

      console.log(`✓ PTY terminal created: ${sessionId}`);
      }
    } else {
      // Simulated terminal (fallback) - virtual VFS-backed cwd
      // Create a persistent log document for this session
      let logId = null;
      try {
        const logDoc = await TerminalLog.create({
          sessionId,
          workspaceId,
          userId,
          entries: [],
          status: 'active'
        });
        logId = logDoc._id;
      } catch (err) {
        console.warn('Failed to create terminal log:', err.message);
      }

      this.terminals.set(sessionId, {
        type: 'simulated',
        workspacePath,
        userId,
        workspaceId,
        token: sessionToken,
        history: [],
        logId,
        cwd: '/',
        createdAt: Date.now()
      });

      console.log(`✓ Simulated terminal created: ${sessionId}`);
    }

    // Sync VFS tree to PTY workspace directory so ls shows editor files immediately
    if (this.usePty) {
      await this.syncVfsToPty(sessionId);
    }

    // VPS transport: start ssh+container, then push the materialized files in.
    const vpsProcess = this.usePty ? this.terminals.get(sessionId)?.process : null;
    if (vpsProcess && this.terminals.get(sessionId)?.vps) {
      try {
        await vpsProcess.start();
        await vpsProcess.pushFiles();
      } catch (err) {
        try { vpsProcess.kill(); } catch (_) { /* ignore */ }
        this.terminals.delete(sessionId);
        this.workspaces.delete(sessionId);
        try { await fs.rm(workspacePath, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        throw err;
      }
      console.log(`✓ VPS terminal created: ${sessionId}`);
    }

    // Setup directory watcher for PTY terminals (local transport only — the
    // VPS session syncs back to the VFS on destroy instead).
    if (this.usePty && !this.terminals.get(sessionId)?.vps) {
      this.setupDirectoryWatcher(sessionId);
    }

    return {
      sessionId,
      token: sessionToken,
      workspacePath,
      type: this.usePty ? 'pty' : 'simulated'
    };
  }

  /**
   * Verify that the caller holds the session token issued at creation.
   * Returns the terminal record, null when the session does not exist
   * (callers preserve their existing not-found behavior), and throws
   * Error('Access denied') on token mismatch.
   */
  _checkAccess(sessionId, token) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) return null;
    if (terminal.token && token !== terminal.token) {
      throw new Error('Access denied');
    }
    return terminal;
  }

  /**
   * Write data to terminal
   */
  write(sessionId, data, token) {
    const terminal = this._checkAccess(sessionId, token);
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
    this._persistEntry(sessionId, 'input', command);

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
                resolveInWorkspace(terminal.workspacePath, newPath);
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
              resolveInWorkspace(terminal.workspacePath, folderPath);
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
              resolveInWorkspace(terminal.workspacePath, filePath);
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
              resolveInWorkspace(terminal.workspacePath, targetPath);
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
              resolveInWorkspace(terminal.workspacePath, targetPath);
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
      this._persistEntry(sessionId, 'output', output);

      // Emit output event (will be handled by Socket.IO)
      if (terminal.onData) {
        terminal.onData(output);
      }
    } catch (error) {
      const errorOutput = `Error: ${error.message}\n`;
      terminal.history.push({ type: 'output', data: errorOutput });
      this._persistEntry(sessionId, 'error', errorOutput);
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

    // Direct query instead of the shared index: keeps hydration working even
    // before an index exists, and scopes to the selected project so the shell
    // only sees THIS project's files (the old company-wide dump mixed files
    // from every project in the workspace into the terminal).
    const query = { company: terminal.workspaceId };
    if (terminal.projectId) query.project = terminal.projectId;

    const docs = await CodeFile.find(query).select('name path content').lean();

    for (const doc of docs) {
      try {
        // Skip GitHub-repo-style entries already stored full-path — fullPathOf
        // normalizes both dir+name and full-path shapes.
        const fsPath = resolveInWorkspace(terminal.workspacePath, vfs.fullPathOf(doc));
        const dir = path.dirname(fsPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fsPath, doc.content || '');
      } catch (error) {
        console.error(`Failed to sync file ${doc.path}/${doc.name} to PTY:`, error);
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
          const fsPath = resolveInWorkspace(terminal.workspacePath, vfs.fullPathOf(data.file));
          const dir = path.dirname(fsPath);
          await fs.mkdir(dir, { recursive: true });

          const file = await CodeFile.findById(data.file._id).select('content').lean();
          if (file) {
            await fs.writeFile(fsPath, file.content || '');
          }
          break;
        }
        case 'file:updated': {
          const fsPath = resolveInWorkspace(terminal.workspacePath, vfs.fullPathOf(data.file));
          const file = await CodeFile.findById(data.file._id).select('content').lean();
          if (file) {
            await fs.writeFile(fsPath, file.content || '');
          }
          break;
        }
        case 'file:deleted': {
          const vfsPath = data.path;
          const fsPath = resolveInWorkspace(terminal.workspacePath, vfsPath);
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
  onData(sessionId, callback, token) {
    const terminal = this._checkAccess(sessionId, token);
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
  resize(sessionId, cols, rows, token) {
    const terminal = this._checkAccess(sessionId, token);
    if (!terminal) {
      throw new Error('Terminal session not found');
    }

    if (terminal.type === 'pty') {
      terminal.process.resize(cols, rows);
    }
  }

  /**
   * Get terminal history (simulated only).
   * Returns in-memory history for active sessions, falls back to Mongo.
   */
  /**
   * Bulk upsert every file in the local PTY workspace dir back into the VFS.
   * Used after a VPS session's pull-back so container edits persist.
   */
  async syncPtyDirToVfs(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (!terminal) return;

    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!e.isFile()) continue;
        const content = await fs.readFile(full, 'utf8').catch(() => null);
        if (content === null) continue;
        const vfsPath = '/' + path.relative(terminal.workspacePath, full).replace(/\\/g, '/');
        await CodeFile.updateOne(
          { company: terminal.workspaceId, path: vfsPath },
          {
            $set: { content, lastModifiedBy: terminal.userId },
            $setOnInsert: {
              name: e.name,
              language: EXT_LANG_MAP[path.extname(e.name).toLowerCase()] || 'text',
              company: terminal.workspaceId,
              path: vfsPath,
              createdBy: terminal.userId,
            },
          },
          { upsert: true }
        );
      }
    };

    await walk(terminal.workspacePath);
  }

  async getHistory(sessionId, token) {
    const terminal = this._checkAccess(sessionId, token);
    if (!terminal || terminal.type !== 'simulated') {
      return [];
    }
    // Return in-memory if available
    if (terminal.history && terminal.history.length > 0) {
      return terminal.history;
    }

    // Fall back to Mongo for sessions that were restored
    if (terminal.logId) {
      try {
        const log = await TerminalLog.findById(terminal.logId).lean();
        return log?.entries || [];
      } catch (_) {}
    }

    return [];
  }

  /**
   * Retrieve a specific terminal log entry by its stable reference ID.
   * Enables cross-platform referencing (e.g., agent referencing a specific output).
   */
  async getEntryByRefId(refId) {
    try {
      const log = await TerminalLog.findOne(
        { 'entries.refId': refId },
        { 'entries.$': 1 }
      ).lean();
      return log?.entries?.[0] || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Get all logs for a workspace (for debugging/audit).
   */
  async getLogsByWorkspace(workspaceId, limit = 50) {
    try {
      return await TerminalLog.find({ workspaceId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } catch (_) {
      return [];
    }
  }

  /**
   * Destroy terminal session
   */
  async destroy(sessionId, token) {
    const terminal = this._checkAccess(sessionId, token);
    if (!terminal) {
      return;
    }

    if (terminal.type === 'pty') {
      if (terminal.vps) {
        // Round-trip: container workspace → local dir → VFS before teardown.
        try { await terminal.process.pullFiles(); } catch (e) { console.warn(`VPS terminal pull-back failed: ${e.message}`); }
        try { await this.syncPtyDirToVfs(sessionId); } catch (e) { console.warn(`VFS sync-back failed: ${e.message}`); }
      }
      terminal.process.kill();
    }

    // Mark log as ended
    if (terminal.logId) {
      try {
        await TerminalLog.updateOne(
          { _id: terminal.logId },
          { status: 'ended' }
        );
      } catch (_) {}
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
        await this.destroy(sessionId, terminal.token);
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
