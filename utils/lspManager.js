/**
 * LSP Manager - Language Server Protocol Integration
 * Real-time IntelliSense without consuming AI tokens.
 *
 * Supports TypeScript/JavaScript (typescript-language-server + tsserver)
 * and Python (pyright). Fixes over the original implementation:
 *   - language aliases (javascript → typescript) prevent unbounded recursion
 *   - correct nested server registry keying (userId → language → server)
 *   - proper Content-Length framed message parser (was double-splitting)
 *   - `initialized` notification after the initialize handshake
 *   - spawn ENOENT / early-exit handling → graceful empty results
 *   - monotonic request ids (Date.now() collided within one millisecond)
 *   - server→client requests answered so servers never stall
 */

const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const INITIALIZE_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 8000;

class LSPManager {
  constructor() {
    this.servers = new Map(); // userId -> Map(language -> server)
    this.starting = new Map(); // `${userId}-${language}` -> Promise (single-flight)
    this.documentVersions = new Map(); // `${userId}-${documentUri}` -> version
    this.capabilities = new Map(); // language -> server capabilities
    this.requestCounter = 0;
    // Each language server is a real process holding the user's whole project
    // in memory. Without a global cap and idle eviction, N users × M languages
    // exhausts host memory — a cheap DoS from the client side.
    this.maxTotalServers = parseInt(process.env.LSP_MAX_SERVERS, 10) || 40;
    this.idleTimeoutMs = parseInt(process.env.LSP_IDLE_TIMEOUT_MS, 10) || 15 * 60 * 1000;
    // Workspace root used as LSP rootUri — must contain node_modules with
    // typescript so typescript-language-server can resolve tsserver.
    this.rootUri = pathToFileURL(process.cwd()).href;

    this.serverConfigs = {
      typescript: {
        command: process.execPath,
        args: [path.join(__dirname, '../node_modules/typescript-language-server/lib/cli.mjs'), '--stdio'],
        available: (() => {
          try { return require('fs').existsSync(path.join(__dirname, '../node_modules/typescript-language-server/lib/cli.mjs')); }
          catch (_) { return false; }
        })(),
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics'],
      },
      python: {
        command: process.execPath,
        args: (() => {
          try { return [require.resolve('pyright/langserver.index.js'), '--stdio']; }
          catch (_) { return null; }
        })(),
        available: (() => {
          try { require.resolve('pyright/langserver.index.js'); return true; }
          catch (_) { return false; }
        })(),
        extensions: ['.py'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics'],
      },
      java: {
        command: 'jdtls',
        args: [],
        available: false, // jdtls is not bundled; enable when provisioned
        extensions: ['.java'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics'],
      },
    };

    this.languageAliases = {
      javascript: 'typescript', js: 'typescript', jsx: 'typescript',
      node: 'typescript', mjs: 'typescript', cjs: 'typescript',
      ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
      python: 'python', py: 'python', python3: 'python',
      java: 'java',
    };
  }

  normalizeLanguage(language) {
    const key = String(language || '').trim().toLowerCase();
    return this.languageAliases[key] || null;
  }

  getServer(userId, language) {
    const server = this.servers.get(userId)?.get(language) || null;
    if (server) this._touch(userId, language, server);
    return server;
  }

  /** Total live language-server processes across all users. */
  countServers() {
    let total = 0;
    for (const userMap of this.servers.values()) total += userMap.size;
    return total;
  }

  /** Restart an idle timer so an actively-used server is never evicted. */
  _touch(userId, language, server) {
    if (server.idleTimer) clearTimeout(server.idleTimer);
    server.lastUsedAt = Date.now();
    server.idleTimer = setTimeout(() => {
      this._evict(userId, language);
    }, this.idleTimeoutMs);
    // Do not hold the event loop open for an eviction timer.
    if (typeof server.idleTimer.unref === 'function') server.idleTimer.unref();
  }

  /** Stop the least-recently-used language server to free a slot. */
  _evictOne() {
    let oldest = null;
    for (const [userId, userMap] of this.servers.entries()) {
      for (const [language, server] of userMap.entries()) {
        if (!oldest || (server.lastUsedAt || 0) < (oldest.server.lastUsedAt || 0)) {
          oldest = { userId, language, server };
        }
      }
    }
    if (oldest) this._evict(oldest.userId, oldest.language);
    return Boolean(oldest);
  }

  _evict(userId, language) {
    const userMap = this.servers.get(userId);
    if (!userMap) return;
    const server = userMap.get(language);
    if (!server) return;
    if (server.idleTimer) clearTimeout(server.idleTimer);
    console.log(`LSP: evicting idle server ${language} for user ${userId}`);
    try { server.process.kill('SIGTERM'); } catch (_) { /* already gone */ }
    server.dead = true;
    for (const handler of server.responseHandlers.values()) handler(null);
    server.responseHandlers.clear();
    userMap.delete(language);
    if (userMap.size === 0) this.servers.delete(userId);
  }

  /**
   * Start (or await the start of) an LSP server for a user + language.
   */
  async startServer(userId, language) {
    const norm = this.normalizeLanguage(language);
    if (!norm) {
      return { success: false, error: `Unsupported language: ${language}` };
    }
    const existing = this.getServer(userId, norm);
    if (existing) {
      return { success: true, message: 'Server already running', language: norm };
    }

    const startKey = `${userId}-${norm}`;
    if (this.starting.has(startKey)) {
      await this.starting.get(startKey);
      return this.getServer(userId, norm)
        ? { success: true, message: 'Server already running', language: norm }
        : { success: false, error: `Failed to start LSP server for ${norm}` };
    }

    const startPromise = this._start(userId, norm);
    this.starting.set(startKey, startPromise);
    try {
      return await startPromise;
    } finally {
      this.starting.delete(startKey);
    }
  }

  async _start(userId, language) {
    const config = this.serverConfigs[language];
    if (!config) {
      return { success: false, error: `Unsupported language: ${language}` };
    }
    if (!config.available || !config.args) {
      return { success: false, error: `Language server for ${language} is not installed` };
    }

    // Enforce the global process cap before spawning another server.
    while (this.countServers() >= this.maxTotalServers) {
      if (!this._evictOne()) break;
    }

    let serverProcess;
    try {
      serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
    } catch (error) {
      return { success: false, error: error.message };
    }

    if (!this.servers.has(userId)) {
      this.servers.set(userId, new Map());
    }
    const server = {
      process: serverProcess,
      responseHandlers: new Map(), // id -> resolve(result|null)
      ready: false,
      dead: false,
      lastUsedAt: Date.now(),
      idleTimer: null,
    };
    this.servers.get(userId).set(language, server);
    this._touch(userId, language, server);

    const failPending = () => {
      for (const handler of server.responseHandlers.values()) handler(null);
      server.responseHandlers.clear();
    };

    serverProcess.on('error', () => {
      // ENOENT or similar — binary missing
      server.dead = true;
      this._removeServer(userId, language);
      failPending();
    });
    serverProcess.on('exit', () => {
      server.dead = true;
      this._removeServer(userId, language);
      failPending();
    });
    serverProcess.stderr.on('data', (data) => {
      console.error(`LSP ${language} stderr:`, String(data).slice(0, 500));
    });

    this._setupMessageHandler(language, serverProcess, server);

    // Initialize handshake: initialize → (result) → initialized
    const initResult = await this._request(
      server,
      'initialize',
      {
        processId: process.pid,
        rootUri: this.rootUri,
        capabilities: {
          textDocument: {
            completion: { completionItem: { snippetSupport: false } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: {},
            references: {},
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: { configuration: false },
        },
      },
      INITIALIZE_TIMEOUT_MS,
      null
    );

    if (!initResult || server.dead) {
      try { serverProcess.kill(); } catch (_) { /* ignore */ }
      this._removeServer(userId, language);
      return { success: false, error: `LSP server for ${language} failed to initialize (binary missing or too slow)` };
    }

    this._notify(server, 'initialized', {});
    server.ready = true;
    this.capabilities.set(language, initResult.capabilities || {});
    return { success: true, message: `LSP server started for ${language}`, language };
  }

  _removeServer(userId, language) {
    const userMap = this.servers.get(userId);
    if (!userMap) return;
    // Clear the eviction timer, otherwise a removed server's timer fires later
    // and evicts an unrelated server that has since taken this slot.
    const server = userMap.get(language);
    if (server && server.idleTimer) {
      clearTimeout(server.idleTimer);
      server.idleTimer = null;
    }
    const key = `${userId}-`;
    for (const versionKey of this.documentVersions.keys()) {
      if (versionKey.startsWith(key)) this.documentVersions.delete(versionKey);
    }
    userMap.delete(language);
    if (userMap.size === 0) this.servers.delete(userId);
  }

  /**
   * Content-Length framed parser. The previous implementation split the
   * header and body apart and then tried to re-split them, so responses
   * never parsed. This accumulates bytes and extracts exact frames.
   */
  _setupMessageHandler(language, serverProcess, server) {
    let buffer = Buffer.alloc(0);

    serverProcess.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd).toString('ascii');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const length = parseInt(match[1], 10);
        const frameEnd = headerEnd + 4 + length;
        if (buffer.length < frameEnd) break;
        const body = buffer.slice(headerEnd + 4, frameEnd).toString('utf8');
        buffer = buffer.slice(frameEnd);
        let message;
        try {
          message = JSON.parse(body);
        } catch (_) {
          continue;
        }
        this._handleMessage(language, server, message);
      }
    });
  }

  _handleMessage(language, server, message) {
    if (message.id !== undefined && message.method) {
      // Server → client request. Answer with null so servers never stall
      // (e.g. client/registerCapability, workspace/configuration).
      this._sendMessage(server, { jsonrpc: '2.0', id: message.id, result: null });
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const handler = server.responseHandlers.get(message.id);
      if (handler) {
        server.responseHandlers.delete(message.id);
        handler(message.error ? null : message.result);
      }
      return;
    }
    // Notifications (textDocument/publishDiagnostics, window/logMessage, …)
    // are ignored — Monaco's built-in workers own editor diagnostics.
  }

  _sendMessage(server, message) {
    if (server.dead || !server.process.stdin.writable) return;
    const content = JSON.stringify(message);
    server.process.stdin.write(`Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n${content}`);
  }

  _notify(server, method, params) {
    this._sendMessage(server, { jsonrpc: '2.0', method, params });
  }

  _request(server, method, params, timeoutMs = REQUEST_TIMEOUT_MS, fallback = null) {
    if (!server || server.dead) return Promise.resolve(fallback);
    const id = ++this.requestCounter;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.responseHandlers.delete(id);
        resolve(fallback);
      }, timeoutMs);
      server.responseHandlers.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this._sendMessage(server, { jsonrpc: '2.0', id, method, params });
    });
  }

  /**
   * Ensure a server is running for this user+language.
   * Returns the server + normalized language, or null (no recursion).
   */
  async _ensure(userId, language) {
    const norm = this.normalizeLanguage(language);
    if (!norm) return null;
    let server = this.getServer(userId, norm);
    if (!server) {
      const result = await this.startServer(userId, norm);
      if (!result.success) return null;
      server = this.getServer(userId, norm);
      if (!server) return null;
    }
    return { server, norm };
  }

  async getCompletions(userId, language, documentUri, position, content) {
    const ensured = await this._ensure(userId, language);
    if (!ensured) return { items: [] };
    const { server, norm } = ensured;
    await this.didOpenDocument(userId, norm, documentUri, content, language);
    const result = await this._request(server, 'textDocument/completion', {
      textDocument: { uri: documentUri },
      position: { line: position.line, character: position.character },
    });
    if (!result) return { items: [] };
    if (Array.isArray(result)) return { items: result };
    if (Array.isArray(result.items)) return result;
    return { items: [] };
  }

  async getHover(userId, language, documentUri, position, content) {
    const ensured = await this._ensure(userId, language);
    if (!ensured) return null;
    const { server, norm } = ensured;
    await this.didOpenDocument(userId, norm, documentUri, content, language);
    return this._request(server, 'textDocument/hover', {
      textDocument: { uri: documentUri },
      position: { line: position.line, character: position.character },
    });
  }

  async getDefinition(userId, language, documentUri, position, content) {
    const ensured = await this._ensure(userId, language);
    if (!ensured) return null;
    const { server, norm } = ensured;
    await this.didOpenDocument(userId, norm, documentUri, content, language);
    return this._request(server, 'textDocument/definition', {
      textDocument: { uri: documentUri },
      position: { line: position.line, character: position.character },
    });
  }

  async getReferences(userId, language, documentUri, position, content) {
    const ensured = await this._ensure(userId, language);
    if (!ensured) return [];
    const { server, norm } = ensured;
    await this.didOpenDocument(userId, norm, documentUri, content, language);
    const result = await this._request(server, 'textDocument/references', {
      textDocument: { uri: documentUri },
      position: { line: position.line, character: position.character },
      context: { includeDeclaration: true },
    });
    return Array.isArray(result) ? result : [];
  }

  async didOpenDocument(userId, language, documentUri, content) {
    const versionKey = `${userId}-${documentUri}`;
    if (this.documentVersions.has(versionKey)) return;
    const server = this.getServer(userId, language);
    if (!server) return;
    this._notify(server, 'textDocument/didOpen', {
      textDocument: {
        uri: documentUri,
        languageId: language,
        version: 1,
        text: content,
      },
    });
    this.documentVersions.set(versionKey, 1);
  }

  async didChangeDocument(userId, language, documentUri, content) {
    const norm = this.normalizeLanguage(language) || language;
    const versionKey = `${userId}-${documentUri}`;
    const server = this.getServer(userId, norm);
    if (!server) return;
    const version = (this.documentVersions.get(versionKey) || 0) + 1;
    this.documentVersions.set(versionKey, version);
    this._notify(server, 'textDocument/didChange', {
      textDocument: { uri: documentUri, version },
      contentChanges: [{ text: content }],
    });
  }

  async didCloseDocument(userId, language, documentUri) {
    const norm = this.normalizeLanguage(language) || language;
    const versionKey = `${userId}-${documentUri}`;
    const server = this.getServer(userId, norm);
    if (server) {
      this._notify(server, 'textDocument/didClose', {
        textDocument: { uri: documentUri },
      });
    }
    this.documentVersions.delete(versionKey);
  }

  async stopServer(userId, language) {
    const norm = this.normalizeLanguage(language) || language;
    const server = this.getServer(userId, norm);
    if (!server) {
      return { success: false, error: 'Server not running' };
    }
    await this._request(server, 'shutdown', null, 2000, null);
    this._notify(server, 'exit', null);
    setTimeout(() => {
      try { server.process.kill(); } catch (_) { /* ignore */ }
    }, 250);
    this._removeServer(userId, norm);
    return { success: true, message: `LSP server stopped for ${norm}` };
  }

  async stopAllServers(userId) {
    const userServers = this.servers.get(userId);
    if (!userServers) return;
    for (const language of [...userServers.keys()]) {
      await this.stopServer(userId, language);
    }
    this.servers.delete(userId);
  }

  getLanguageFromExtension(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    for (const [language, config] of Object.entries(this.serverConfigs)) {
      if (config.extensions.includes(ext)) return language;
    }
    return null;
  }
}

// Singleton instance
const lspManager = new LSPManager();

module.exports = lspManager;
module.exports.LSPManager = LSPManager;
