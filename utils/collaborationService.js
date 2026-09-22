/**
 * Real-Time Collaboration Service using Yjs CRDT
 * Enables conflict-free multi-user editing with agent-vs-human conflict resolution
 */

const Y = require('yjs');
const { encoding, decoding } = require('lib0');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const unifiedStateGraph = require('./unifiedStateGraph');

// Conflict resolution policies
const CONFLICT_POLICIES = {
    HUMAN_PRIORITY: 'human_edits_always_win',
    AGENT_COOLDOWN: 5000, // Agent blocked for 5s after human edit
    STATUS_APPROVAL: true, // Agent cannot change task status directly
};

class CollaborationService {
    constructor() {
        // Map of fileId -> Y.Doc
        this.documents = new Map();
        
        // Map of fileId -> Set of connected clients
        this.clients = new Map();
        
        // Map of fileId -> Awareness instance
        this.awareness = new Map();
        
        // Persistence queue
        this.persistenceQueue = new Map();
        this.persistenceInterval = 5000; // Save every 5 seconds

        // Tracking timeouts for cleanup
        this.cleanupTimeouts = new Map(); // fileId -> timeoutId

        this._persistenceWorker = null;
        // Start persistence worker unless running tests (tests will control lifecycle)
        if (process.env.NODE_ENV !== 'test') {
            this.startPersistenceWorker();
        }
    }
    
    /**
     * Get or create a Y.Doc for a file
     */
    getDocument(fileId, initialContent = '') {
        if (!this.documents.has(fileId)) {
            const ydoc = new Y.Doc();
            const ytext = ydoc.getText('content');
            
            // Initialize with content if provided
            if (initialContent) {
                ytext.insert(0, initialContent);
            }
            
            // Listen for updates
            ydoc.on('update', (update) => {
                this.queuePersistence(fileId, ydoc);
            });
            
            this.documents.set(fileId, ydoc);
            
            // Create awareness instance
            const awareness = new awarenessProtocol.Awareness(ydoc);
            this.awareness.set(fileId, awareness);
            
            console.log(`Created Y.Doc for file: ${fileId}`);
        }
        
        return this.documents.get(fileId);
    }
    
    /**
     * Get awareness instance for a file
     */
    getAwareness(fileId) {
        return this.awareness.get(fileId);
    }
    
    /**
     * Add a client to a document.
     * role: 'human' | 'agent' — used for conflict resolution policies.
     */
    addClient(fileId, socket, role = 'human') {
        if (!this.clients.has(fileId)) {
            this.clients.set(fileId, new Set());
        }
        
        // Track client role for conflict resolution
        if (!this.clientRoles) this.clientRoles = new Map();
        this.clientRoles.set(socket.id, { role, fileId, joinedAt: Date.now() });

        this.clients.get(fileId).add(socket);
        
        const ydoc = this.getDocument(fileId);
        const awareness = this.getAwareness(fileId);
        
        // Send initial sync
        this.sendSyncStep1(socket, ydoc);
        
        // Send awareness states
        this.sendAwarenessStates(socket, awareness);

        // Register in unified state graph
        unifiedStateGraph.registerNode('file', fileId, { role });

        console.log(`Client [${role}] connected to file: ${fileId}, total: ${this.clients.get(fileId).size}`);
    }
    
    /**
     * Remove a client from a document
     */
    removeClient(fileId, socket) {
        const clients = this.clients.get(fileId);
        if (clients) {
            clients.delete(socket);

            // Clean up role tracking
            if (this.clientRoles) this.clientRoles.delete(socket.id);
            
            if (clients.size === 0) {
                // Clear existing cleanup timeout if any
                if (this.cleanupTimeouts.has(fileId)) {
                    clearTimeout(this.cleanupTimeouts.get(fileId));
                }

                // No more clients, persist and cleanup after delay
                const timeoutId = setTimeout(() => {
                    if (this.clients.get(fileId)?.size === 0) {
                        this.persistDocument(fileId);
                        this.documents.delete(fileId);
                        this.awareness.delete(fileId);
                        this.clients.delete(fileId);
                        this.cleanupTimeouts.delete(fileId);
                        console.log(`Cleaned up document: ${fileId}`);
                    }
                }, 30000); // 30 second grace period

                this.cleanupTimeouts.set(fileId, timeoutId);
            }
            
            console.log(`Client disconnected from file: ${fileId}, remaining: ${clients.size}`);
        }
    }
    
    /**
     * Handle sync message from client.
     * Applies conflict resolution policies for agent edits.
     */
    handleSyncMessage(fileId, socket, message) {
        try {
            if (!message || message.byteLength === 0) return;

            const ydoc = this.getDocument(fileId);
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(message);
            const messageType = decoding.readVarUint(decoder);
            
            // Get client role for conflict resolution
            const clientInfo = this.clientRoles?.get(socket.id);
            const role = clientInfo?.role || 'human';

            switch (messageType) {
                case syncProtocol.messageYjsSyncStep1:
                    syncProtocol.readSyncStep1(decoder, encoder, ydoc);
                    this.sendMessage(socket, encoding.toUint8Array(encoder));
                    break;
                    
                case syncProtocol.messageYjsSyncStep2:
                    syncProtocol.readSyncStep2(decoder, ydoc);
                    break;
                    
                case syncProtocol.messageYjsUpdate:
                    // Conflict check for agent edits
                    if (role === 'agent') {
                        const conflictCheck = this._checkFileConflict(fileId, socket);
                        if (conflictCheck.blocked) {
                            console.log(`Agent edit blocked on ${fileId}: ${conflictCheck.reason}`);
                            return; // Drop the update
                        }
                    }
                    syncProtocol.readUpdate(decoder, ydoc);
                    this.broadcastUpdate(fileId, socket, message);

                    // Track last edit time for conflict resolution
                    if (!this._lastEditTimes) this._lastEditTimes = new Map();
                    this._lastEditTimes.set(fileId, { role, timestamp: Date.now() });
                    break;
            }
        } catch (error) {
            console.error(`Sync message error for file ${fileId}:`, error.message);
        }
    }
    
    /**
     * Handle awareness message from client
     */
    handleAwarenessMessage(fileId, socket, message) {
        try {
            if (!message || message.byteLength === 0) return;

            const awareness = this.getAwareness(fileId);
            const decoder = decoding.createDecoder(message);
            
            awarenessProtocol.applyAwarenessUpdate(
                awareness,
                decoding.readVarUint8Array(decoder),
                socket
            );
            
            this.broadcastAwareness(fileId, socket, message);
        } catch (error) {
            console.error(`Awareness message error for file ${fileId}:`, error.message);
        }
    }
    
    /**
     * Send sync step 1 to client
     */
    sendSyncStep1(socket, ydoc) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
        syncProtocol.writeSyncStep1(encoder, ydoc);
        this.sendMessage(socket, encoding.toUint8Array(encoder));
    }
    
    /**
     * Send awareness states to client
     */
    sendAwarenessStates(socket, awareness) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1); // Awareness message type
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
                awareness,
                Array.from(awareness.getStates().keys())
            )
        );
        this.sendMessage(socket, encoding.toUint8Array(encoder));
    }
    
    /**
     * Send message to socket
     */
    sendMessage(socket, message) {
        if (socket.connected) {
            socket.emit('collab:message', message);
        }
    }
    
    /**
     * Broadcast update to all clients except sender
     */
    broadcastUpdate(fileId, sender, message) {
        const clients = this.clients.get(fileId);
        if (clients) {
            clients.forEach(client => {
                if (client !== sender) {
                    this.sendMessage(client, message);
                }
            });
        }
    }
    
    /**
     * Broadcast awareness to all clients except sender
     */
    broadcastAwareness(fileId, sender, message) {
        const clients = this.clients.get(fileId);
        if (clients) {
            clients.forEach(client => {
                if (client !== sender) {
                    this.sendMessage(client, message);
                }
            });
        }
    }
    
    /**
     * Queue document for persistence
     */
    queuePersistence(fileId, ydoc) {
        this.persistenceQueue.set(fileId, {
            ydoc,
            timestamp: Date.now()
        });
    }
    
    /**
     * Persist document to database
     */
    async persistDocument(fileId) {
        if (process.env.NODE_ENV === 'test') return;
        
        const ydoc = this.documents.get(fileId);
        if (!ydoc) return;
        
        try {
            const CodeFile = require('../models/CodeFile');
            const ytext = ydoc.getText('content');
            const content = ytext.toString();
            
            // Save to database
            await CodeFile.findByIdAndUpdate(fileId, {
                content,
                ydocState: Y.encodeStateAsUpdate(ydoc),
                lastModified: new Date()
            });
            
            console.log(`Persisted document: ${fileId}`);
        } catch (error) {
            console.error(`Failed to persist document ${fileId}:`, error);
        }
    }
    
    /**
     * Start persistence worker
     */
    startPersistenceWorker() {
        // Clear existing worker if any
        if (this._persistenceWorker) {
            clearInterval(this._persistenceWorker);
        }

        this._persistenceWorker = setInterval(() => {
            const now = Date.now();
            
            this.persistenceQueue.forEach((data, fileId) => {
                // Persist if older than interval
                if (now - data.timestamp >= this.persistenceInterval) {
                    this.persistDocument(fileId);
                    this.persistenceQueue.delete(fileId);
                }
            });
        }, this.persistenceInterval);
    }

    stopPersistenceWorker() {
        if (this._persistenceWorker) {
            clearInterval(this._persistenceWorker);
            this._persistenceWorker = null;
        }
    }

    /**
     * Check if an agent edit should be blocked based on conflict resolution policies.
     * Returns { blocked, reason } for agent edits that conflict with recent human edits.
     */
    _checkFileConflict(fileId, socket) {
        if (!this._lastEditTimes) return { blocked: false };

        const lastEdit = this._lastEditTimes.get(fileId);
        if (!lastEdit) return { blocked: false };

        const timeSinceHumanEdit = Date.now() - lastEdit.timestamp;

        // Policy: Agent blocked if human edited within cooldown period
        if (lastEdit.role === 'human' && timeSinceHumanEdit < CONFLICT_POLICIES.AGENT_COOLDOWN) {
            return {
                blocked: true,
                reason: `Human edited ${timeSinceHumanEdit}ms ago — agent cooldown active`,
                policy: 'AGENT_COOLDOWN'
            };
        }

        return { blocked: false };
    }

    /**
     * Get conflict resolution policies (for debugging/status).
     */
    getConflictPolicies() {
        return { ...CONFLICT_POLICIES };
    }

    /**
     * Stop the service and cleanup all handles
     */
    async stop() {
        this.stopPersistenceWorker();

        // Clear persistence queue to prevent new saves during shutdown
        this.persistenceQueue.clear();

        // Clear all cleanup timeouts
        this.cleanupTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.cleanupTimeouts.clear();

        // Clean up documents
        const persistPromises = [];
        this.documents.forEach((ydoc, fileId) => {
            persistPromises.push(this.persistDocument(fileId).catch(() => {}));
            ydoc.destroy();
        });
        await Promise.all(persistPromises);

        this.documents.clear();
        this.awareness.clear();
        this.clients.clear();

        console.log('Collaboration service stopped and cleaned up');
    }
    
    /**
     * Load document from database
     */
    async loadDocument(fileId) {
        try {
            const CodeFile = require('../models/CodeFile');
            const file = await CodeFile.findById(fileId);
            
            if (!file) {
                throw new Error('File not found');
            }
            
            const ydoc = this.getDocument(fileId);
            
            // Apply saved state if exists
            if (file.ydocState) {
                Y.applyUpdate(ydoc, file.ydocState);
            } else {
                // Initialize with content
                const ytext = ydoc.getText('content');
                ytext.insert(0, file.content || '');
            }
            
            return ydoc;
        } catch (error) {
            console.error(`Failed to load document ${fileId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get active users for a file
     */
    getActiveUsers(fileId) {
        const awareness = this.getAwareness(fileId);
        if (!awareness) return [];
        
        const states = awareness.getStates();
        const users = [];
        
        states.forEach((state, clientId) => {
            if (state.user) {
                users.push({
                    clientId,
                    user: state.user,
                    cursor: state.cursor,
                    selection: state.selection
                });
            }
        });
        
        return users;
    }
}

module.exports = new CollaborationService();
