/**
 * Real-Time Collaboration Service using Yjs CRDT
 * Enables conflict-free multi-user editing
 */

const Y = require('yjs');
const { encoding, decoding } = require('lib0');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');

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
        
        this.startPersistenceWorker();
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
     * Add a client to a document
     */
    addClient(fileId, socket) {
        if (!this.clients.has(fileId)) {
            this.clients.set(fileId, new Set());
        }
        
        this.clients.get(fileId).add(socket);
        
        const ydoc = this.getDocument(fileId);
        const awareness = this.getAwareness(fileId);
        
        // Send initial sync
        this.sendSyncStep1(socket, ydoc);
        
        // Send awareness states
        this.sendAwarenessStates(socket, awareness);
        
        console.log(`Client connected to file: ${fileId}, total: ${this.clients.get(fileId).size}`);
    }
    
    /**
     * Remove a client from a document
     */
    removeClient(fileId, socket) {
        const clients = this.clients.get(fileId);
        if (clients) {
            clients.delete(socket);
            
            if (clients.size === 0) {
                // No more clients, persist and cleanup after delay
                setTimeout(() => {
                    if (this.clients.get(fileId)?.size === 0) {
                        this.persistDocument(fileId);
                        this.documents.delete(fileId);
                        this.awareness.delete(fileId);
                        this.clients.delete(fileId);
                        console.log(`Cleaned up document: ${fileId}`);
                    }
                }, 30000); // 30 second grace period
            }
            
            console.log(`Client disconnected from file: ${fileId}, remaining: ${clients.size}`);
        }
    }
    
    /**
     * Handle sync message from client
     */
    handleSyncMessage(fileId, socket, message) {
        const ydoc = this.getDocument(fileId);
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);
        
        switch (messageType) {
            case syncProtocol.messageYjsSyncStep1:
                syncProtocol.readSyncStep1(decoder, encoder, ydoc);
                this.sendMessage(socket, encoding.toUint8Array(encoder));
                break;
                
            case syncProtocol.messageYjsSyncStep2:
                syncProtocol.readSyncStep2(decoder, ydoc);
                break;
                
            case syncProtocol.messageYjsUpdate:
                syncProtocol.readUpdate(decoder, ydoc);
                // Broadcast to other clients
                this.broadcastUpdate(fileId, socket, message);
                break;
        }
    }
    
    /**
     * Handle awareness message from client
     */
    handleAwarenessMessage(fileId, socket, message) {
        const awareness = this.getAwareness(fileId);
        const decoder = decoding.createDecoder(message);
        
        awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            socket
        );
        
        // Broadcast to other clients
        this.broadcastAwareness(fileId, socket, message);
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
        if (socket.readyState === 1) { // WebSocket.OPEN
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
        setInterval(() => {
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
