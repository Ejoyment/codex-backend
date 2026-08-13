/**
 * Unit tests for CollaborationService (Yjs CRDT)
 * No server.js required - avoids node-pty bus error
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });
process.env.NODE_ENV = 'test';

describe('CollaborationService - Unit Tests', () => {
  let collaborationService;

  beforeAll(() => {
    collaborationService = require('../utils/collaborationService');
  });

  afterAll(() => {
    if (collaborationService.stopPersistenceWorker) {
      collaborationService.stopPersistenceWorker();
    }
  });

  describe('getDocument', () => {
    test('should create a new Y.Doc for a file', () => {
      const doc = collaborationService.getDocument('test-file-1');
      expect(doc).toBeDefined();
      expect(doc.getText).toBeDefined();
    });

    test('should return the same Y.Doc for the same fileId', () => {
      const doc1 = collaborationService.getDocument('test-file-2');
      const doc2 = collaborationService.getDocument('test-file-2');
      expect(doc1).toBe(doc2);
    });

    test('should create separate Y.Docs for different fileIds', () => {
      const doc1 = collaborationService.getDocument('file-a');
      const doc2 = collaborationService.getDocument('file-b');
      expect(doc1).not.toBe(doc2);
    });

    test('should initialize document with content when provided', () => {
      const doc = collaborationService.getDocument('file-with-content', 'hello world');
      const ytext = doc.getText('content');
      expect(ytext.toString()).toBe('hello world');
    });

    test('should create empty document when no content provided', () => {
      const doc = collaborationService.getDocument('empty-file');
      const ytext = doc.getText('content');
      expect(ytext.toString()).toBe('');
    });
  });

  describe('getAwareness', () => {
    test('should return awareness instance for a file', () => {
      collaborationService.getDocument('awareness-test');
      const awareness = collaborationService.getAwareness('awareness-test');
      expect(awareness).toBeDefined();
      expect(typeof awareness.getStates).toBe('function');
    });

    test('should return undefined for unknown fileId', () => {
      const awareness = collaborationService.getAwareness('nonexistent-file');
      expect(awareness).toBeUndefined();
    });
  });

  describe('addClient / removeClient', () => {
    test('should add a client to a file', () => {
      const mockSocket = {
        id: 'socket-add-1',
        connected: true,
        emit: jest.fn(),
      };
      collaborationService.getDocument('add-client-test');
      collaborationService.addClient('add-client-test', mockSocket);
      const users = collaborationService.getActiveUsers('add-client-test');
      expect(Array.isArray(users)).toBe(true);
    });

    test('should remove a client from a file without error', () => {
      const mockSocket = {
        id: 'socket-rm-1',
        connected: true,
        emit: jest.fn(),
      };
      collaborationService.getDocument('remove-client-test');
      collaborationService.addClient('remove-client-test', mockSocket);
      expect(() => {
        collaborationService.removeClient('remove-client-test', mockSocket);
      }).not.toThrow();
    });

    test('removeClient on nonexistent file should not throw', () => {
      const mockSocket = { id: 'orphan', connected: true, emit: jest.fn() };
      expect(() => {
        collaborationService.removeClient('nonexistent', mockSocket);
      }).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    test('should send message when socket is connected', () => {
      const mockSocket = {
        connected: true,
        emit: jest.fn(),
      };
      const message = new Uint8Array([1, 2, 3]);
      collaborationService.sendMessage(mockSocket, message);
      expect(mockSocket.emit).toHaveBeenCalledWith('collab:message', message);
    });

    test('should NOT send message when socket is disconnected', () => {
      const mockSocket = {
        connected: false,
        emit: jest.fn(),
      };
      const message = new Uint8Array([1, 2, 3]);
      collaborationService.sendMessage(mockSocket, message);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleSyncMessage', () => {
    test('should not throw when handling empty sync message', () => {
      const mockSocket = {
        id: 'sync-socket-1',
        connected: true,
        emit: jest.fn(),
      };
      collaborationService.getDocument('sync-test-1');
      expect(() => {
        collaborationService.handleSyncMessage('sync-test-1', mockSocket, new Uint8Array(0));
      }).not.toThrow();
    });

    test('should create document on sync if it does not exist yet', () => {
      const mockSocket = {
        id: 'sync-socket-2',
        connected: true,
        emit: jest.fn(),
      };
      expect(() => {
        collaborationService.handleSyncMessage('sync-auto-create', mockSocket, new Uint8Array(0));
      }).not.toThrow();
      // Document should now exist
      const doc = collaborationService.getDocument('sync-auto-create');
      expect(doc).toBeDefined();
    });
  });

  describe('handleAwarenessMessage', () => {
    test('should not throw when handling empty awareness message', () => {
      const mockSocket = {
        id: 'awareness-socket-1',
        connected: true,
        emit: jest.fn(),
      };
      collaborationService.getDocument('awareness-msg-test');
      expect(() => {
        collaborationService.handleAwarenessMessage('awareness-msg-test', mockSocket, new Uint8Array(0));
      }).not.toThrow();
    });
  });

  describe('getActiveUsers', () => {
    test('should return empty array for file with no awareness state', () => {
      const users = collaborationService.getActiveUsers('no-file-here');
      expect(users).toEqual([]);
    });

    test('should return array for file with awareness', () => {
      collaborationService.getDocument('users-test');
      const users = collaborationService.getActiveUsers('users-test');
      expect(Array.isArray(users)).toBe(true);
    });
  });

  describe('broadcastUpdate', () => {
    test('should broadcast to all clients except sender', () => {
      const socket1 = { id: 'b1', connected: true, emit: jest.fn() };
      const socket2 = { id: 'b2', connected: true, emit: jest.fn() };
      const sender = { id: 'sender', connected: true, emit: jest.fn() };

      collaborationService.getDocument('broadcast-test');
      collaborationService.addClient('broadcast-test', socket1);
      collaborationService.addClient('broadcast-test', socket2);
      collaborationService.addClient('broadcast-test', sender);

      const message = new Uint8Array([10, 20]);
      collaborationService.broadcastUpdate('broadcast-test', sender, message);

      expect(socket1.emit).toHaveBeenCalledWith('collab:message', message);
      expect(socket2.emit).toHaveBeenCalledWith('collab:message', message);
      expect(sender.emit).not.toHaveBeenCalledWith('collab:message', message);
    });

    test('should not crash when no clients exist for file', () => {
      const sender = { id: 'solo', connected: true, emit: jest.fn() };
      expect(() => {
        collaborationService.broadcastUpdate('empty-file', sender, new Uint8Array([1]));
      }).not.toThrow();
    });
  });

  describe('broadcastAwareness', () => {
    test('should broadcast awareness to all clients except sender', () => {
      const socket1 = { id: 'a1', connected: true, emit: jest.fn() };
      const sender = { id: 'a-sender', connected: true, emit: jest.fn() };

      collaborationService.getDocument('awareness-broadcast-test');
      collaborationService.addClient('awareness-broadcast-test', socket1);
      collaborationService.addClient('awareness-broadcast-test', sender);

      const message = new Uint8Array([5, 6, 7]);
      collaborationService.broadcastAwareness('awareness-broadcast-test', sender, message);

      expect(socket1.emit).toHaveBeenCalledWith('collab:message', message);
    });
  });

  describe('persistence', () => {
    test('should queue persistence without error', () => {
      const doc = collaborationService.getDocument('persist-queue-test');
      expect(() => {
        collaborationService.queuePersistence('persist-queue-test', doc);
      }).not.toThrow();
    });

    test('should start and stop persistence worker without error', () => {
      expect(() => {
        collaborationService.startPersistenceWorker();
        collaborationService.stopPersistenceWorker();
      }).not.toThrow();
    });

    test('stopPersistenceWorker should be idempotent', () => {
      collaborationService.startPersistenceWorker();
      collaborationService.stopPersistenceWorker();
      expect(() => {
        collaborationService.stopPersistenceWorker();
      }).not.toThrow();
    });
  });

  describe('sendSyncStep1', () => {
    test('should send sync step 1 to client', () => {
      const mockSocket = {
        connected: true,
        emit: jest.fn(),
      };
      const doc = collaborationService.getDocument('sync-step1-test');
      expect(() => {
        collaborationService.sendSyncStep1(mockSocket, doc);
      }).not.toThrow();
      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });

  describe('sendAwarenessStates', () => {
    test('should send awareness states to client', () => {
      const mockSocket = {
        connected: true,
        emit: jest.fn(),
      };
      collaborationService.getDocument('awareness-states-test');
      const awareness = collaborationService.getAwareness('awareness-states-test');
      expect(() => {
        collaborationService.sendAwarenessStates(mockSocket, awareness);
      }).not.toThrow();
      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });
});
