/**
 * LSP Manager - Language Server Protocol Integration
 * Provides real-time IntelliSense without consuming AI tokens
 * Supports TypeScript, JavaScript, Python, Java
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class LSPManager {
  constructor() {
    this.servers = new Map(); // userId -> { language -> serverProcess }
    this.capabilities = new Map(); // language -> capabilities
    this.documentVersions = new Map(); // documentUri -> version
    
    // Language server configurations
    this.serverConfigs = {
      typescript: {
        command: 'node',
        args: [path.join(__dirname, '../node_modules/typescript-language-server/lib/cli.js'), '--stdio'],
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics']
      },
      python: {
        command: 'pyright-langserver',
        args: ['--stdio'],
        extensions: ['.py'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics']
      },
      java: {
        command: 'jdtls',
        args: [],
        extensions: ['.java'],
        capabilities: ['completion', 'hover', 'definition', 'references', 'diagnostics']
      }
    };
  }

  /**
   * Start LSP server for a user and language
   */
  async startServer(userId, language) {
    const key = `${userId}-${language}`;
    
    if (this.servers.has(key)) {
      return { success: true, message: 'Server already running' };
    }

    const config = this.serverConfigs[language];
    if (!config) {
      return { success: false, error: `Unsupported language: ${language}` };
    }

    try {
      const serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Initialize LSP connection
      const initializeParams = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          processId: process.pid,
          rootUri: null,
          capabilities: {
            textDocument: {
              completion: { dynamicRegistration: true },
              hover: { dynamicRegistration: true },
              definition: { dynamicRegistration: true },
              references: { dynamicRegistration: true },
              publishDiagnostics: { relatedInformation: true }
            }
          }
        }
      };

      this.sendMessage(serverProcess, initializeParams);

      // Store server process
      if (!this.servers.has(userId)) {
        this.servers.set(userId, new Map());
      }
      this.servers.get(userId).set(language, {
        process: serverProcess,
        messageQueue: [],
        responseHandlers: new Map()
      });

      // Handle server responses
      this.setupMessageHandler(userId, language, serverProcess);

      return { success: true, message: `LSP server started for ${language}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup message handler for LSP responses
   */
  setupMessageHandler(userId, language, serverProcess) {
    const key = `${userId}-${language}`;
    let buffer = '';

    serverProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete messages
      const messages = buffer.split('\r\n\r\n');
      buffer = messages.pop(); // Keep incomplete message in buffer

      messages.forEach(msg => {
        if (msg.trim()) {
          try {
            const [headers, content] = msg.split('\r\n\r\n');
            const response = JSON.parse(content);
            this.handleServerResponse(userId, language, response);
          } catch (error) {
            console.error('LSP message parse error:', error);
          }
        }
      });
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`LSP ${language} error:`, data.toString());
    });

    serverProcess.on('exit', (code) => {
      console.log(`LSP ${language} server exited with code ${code}`);
      this.servers.get(userId)?.delete(language);
    });
  }

  /**
   * Handle LSP server responses
   */
  handleServerResponse(userId, language, response) {
    const key = `${userId}-${language}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) return;

    if (response.id && server.responseHandlers.has(response.id)) {
      const handler = server.responseHandlers.get(response.id);
      handler(response.result || response.error);
      server.responseHandlers.delete(response.id);
    }
  }

  /**
   * Send message to LSP server
   */
  sendMessage(serverProcess, message) {
    const content = JSON.stringify(message);
    const headers = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    serverProcess.stdin.write(headers + content);
  }

  /**
   * Get completions for a document position
   */
  async getCompletions(userId, language, documentUri, position, content) {
    const key = `${userId}-${language}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) {
      await this.startServer(userId, language);
      return this.getCompletions(userId, language, documentUri, position, content);
    }

    // Open document if not already open
    await this.didOpenDocument(userId, language, documentUri, content);

    return new Promise((resolve) => {
      const requestId = Date.now();
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'textDocument/completion',
        params: {
          textDocument: { uri: documentUri },
          position: { line: position.line, character: position.character }
        }
      };

      server.responseHandlers.set(requestId, resolve);
      this.sendMessage(server.process, request);

      // Timeout after 5 seconds
      setTimeout(() => {
        if (server.responseHandlers.has(requestId)) {
          server.responseHandlers.delete(requestId);
          resolve({ items: [] });
        }
      }, 5000);
    });
  }

  /**
   * Get hover information
   */
  async getHover(userId, language, documentUri, position, content) {
    const key = `${userId}-${language}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) {
      await this.startServer(userId, language);
      return this.getHover(userId, language, documentUri, position, content);
    }

    await this.didOpenDocument(userId, language, documentUri, content);

    return new Promise((resolve) => {
      const requestId = Date.now();
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'textDocument/hover',
        params: {
          textDocument: { uri: documentUri },
          position: { line: position.line, character: position.character }
        }
      };

      server.responseHandlers.set(requestId, resolve);
      this.sendMessage(server.process, request);

      setTimeout(() => {
        if (server.responseHandlers.has(requestId)) {
          server.responseHandlers.delete(requestId);
          resolve(null);
        }
      }, 5000);
    });
  }

  /**
   * Get definition location
   */
  async getDefinition(userId, language, documentUri, position, content) {
    const key = `${userId}-${language}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) {
      await this.startServer(userId, language);
      return this.getDefinition(userId, language, documentUri, position, content);
    }

    await this.didOpenDocument(userId, language, documentUri, content);

    return new Promise((resolve) => {
      const requestId = Date.now();
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'textDocument/definition',
        params: {
          textDocument: { uri: documentUri },
          position: { line: position.line, character: position.character }
        }
      };

      server.responseHandlers.set(requestId, resolve);
      this.sendMessage(server.process, request);

      setTimeout(() => {
        if (server.responseHandlers.has(requestId)) {
          server.responseHandlers.delete(requestId);
          resolve(null);
        }
      }, 5000);
    });
  }

  /**
   * Get references
   */
  async getReferences(userId, language, documentUri, position, content) {
    const key = `${userId}-${language}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) {
      await this.startServer(userId, language);
      return this.getReferences(userId, language, documentUri, position, content);
    }

    await this.didOpenDocument(userId, language, documentUri, content);

    return new Promise((resolve) => {
      const requestId = Date.now();
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'textDocument/references',
        params: {
          textDocument: { uri: documentUri },
          position: { line: position.line, character: position.character },
          context: { includeDeclaration: true }
        }
      };

      server.responseHandlers.set(requestId, resolve);
      this.sendMessage(server.process, request);

      setTimeout(() => {
        if (server.responseHandlers.has(requestId)) {
          server.responseHandlers.delete(requestId);
          resolve([]);
        }
      }, 5000);
    });
  }

  /**
   * Notify server that document was opened
   */
  async didOpenDocument(userId, language, documentUri, content) {
    const versionKey = `${userId}-${documentUri}`;
    
    if (this.documentVersions.has(versionKey)) {
      return; // Already open
    }

    const server = this.servers.get(userId)?.get(language);
    if (!server) return;

    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: documentUri,
          languageId: language,
          version: 1,
          text: content
        }
      }
    };

    this.sendMessage(server.process, notification);
    this.documentVersions.set(versionKey, 1);
  }

  /**
   * Notify server of document changes
   */
  async didChangeDocument(userId, language, documentUri, content) {
    const versionKey = `${userId}-${documentUri}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) return;

    const version = (this.documentVersions.get(versionKey) || 0) + 1;
    this.documentVersions.set(versionKey, version);

    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: {
          uri: documentUri,
          version: version
        },
        contentChanges: [{ text: content }]
      }
    };

    this.sendMessage(server.process, notification);
  }

  /**
   * Notify server that document was closed
   */
  async didCloseDocument(userId, language, documentUri) {
    const versionKey = `${userId}-${documentUri}`;
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) return;

    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/didClose',
      params: {
        textDocument: { uri: documentUri }
      }
    };

    this.sendMessage(server.process, notification);
    this.documentVersions.delete(versionKey);
  }

  /**
   * Stop LSP server for a user and language
   */
  async stopServer(userId, language) {
    const server = this.servers.get(userId)?.get(language);
    
    if (!server) {
      return { success: false, error: 'Server not running' };
    }

    // Send shutdown request
    const shutdownRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'shutdown',
      params: null
    };

    this.sendMessage(server.process, shutdownRequest);

    // Send exit notification
    setTimeout(() => {
      const exitNotification = {
        jsonrpc: '2.0',
        method: 'exit',
        params: null
      };
      this.sendMessage(server.process, exitNotification);
      server.process.kill();
    }, 1000);

    this.servers.get(userId)?.delete(language);
    return { success: true, message: `LSP server stopped for ${language}` };
  }

  /**
   * Stop all servers for a user
   */
  async stopAllServers(userId) {
    const userServers = this.servers.get(userId);
    if (!userServers) return;

    for (const [language] of userServers) {
      await this.stopServer(userId, language);
    }

    this.servers.delete(userId);
  }

  /**
   * Get language from file extension
   */
  getLanguageFromExtension(filename) {
    const ext = path.extname(filename);
    
    for (const [language, config] of Object.entries(this.serverConfigs)) {
      if (config.extensions.includes(ext)) {
        return language;
      }
    }
    
    return null;
  }
}

// Singleton instance
const lspManager = new LSPManager();

module.exports = lspManager;
