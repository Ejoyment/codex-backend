/**
 * Unified State Graph Service
 *
 * Connects file contents (Yjs CRDT), task card states, and terminal output
 * into a single referenceable graph. Every node gets a stable reference ID
 * that can be cross-linked across the platform.
 *
 * Phase 1.1: Unified Graph Schema + State Reference Identifiers
 */

const Y = require('yjs');
const mongoose = require('mongoose');
const EventEmitter = require('events');
const TerminalLog = require('../models/TerminalLog');
const TeamTask = require('../models/TeamTask');

class UnifiedStateGraph extends EventEmitter {
    constructor() {
        super();

        // Yjs documents for task cards: taskId -> Y.Doc
        this.taskDocs = new Map();

        // State nodes: nodeId -> { type, refId, domain, data, updatedAt }
        this.nodes = new Map();

        // Cross-reference index: domain:key -> nodeId
        this.refIndex = new Map();

        // Conflict log: [{ nodeId, domain, action, role, timestamp, resolved }]
        this.conflictLog = [];
    }

    // ─── Node Management ───────────────────────────────────────

    /**
     * Register a state node in the graph.
     * Returns a stable reference ID for cross-platform linking.
     */
    registerNode(domain, key, data = {}) {
        const nodeId = `graph_${domain}_${key}`;
        const refId = new mongoose.Types.ObjectId();

        const node = {
            nodeId,
            refId,
            domain,    // 'file' | 'task' | 'terminal'
            key,       // domain-specific identifier
            data,
            updatedAt: new Date(),
            version: 1
        };

        this.nodes.set(nodeId, node);
        this.refIndex.set(`${domain}:${key}`, nodeId);

        this.emit('node:registered', node);
        return node;
    }

    /**
     * Get a node by its stable reference ID.
     */
    getNodeByRefId(refId) {
        for (const [, node] of this.nodes) {
            if (node.refId.toString() === refId.toString()) {
                return node;
            }
        }
        return null;
    }

    /**
     * Get a node by domain and key.
     */
    getNode(domain, key) {
        const nodeId = this.refIndex.get(`${domain}:${key}`);
        return nodeId ? this.nodes.get(nodeId) : null;
    }

    /**
     * Get all nodes in a domain.
     */
    getNodesByDomain(domain) {
        const result = [];
        for (const [, node] of this.nodes) {
            if (node.domain === domain) result.push(node);
        }
        return result;
    }

    // ─── Task Card CRDT ────────────────────────────────────────

    /**
     * Get or create a Yjs document for a task card.
     * The CRDT tracks status, priority, and description changes.
     */
    getTaskDocument(taskId) {
        if (!this.taskDocs.has(taskId)) {
            const ydoc = new Y.Doc();

            // Yjs Map for task fields
            const taskMap = ydoc.getMap('task');
            taskMap.set('status', 'todo');
            taskMap.set('priority', 'medium');
            taskMap.set('description', '');
            taskMap.set('title', '');
            taskMap.set('updatedBy', null);
            taskMap.set('updatedAt', Date.now());

            ydoc.on('update', () => {
                const node = this.getNode('task', taskId);
                if (node) {
                    node.data = this._taskMapToObject(taskMap);
                    node.updatedAt = new Date();
                    node.version += 1;
                    this.emit('task:updated', { taskId, data: node.data });
                }
            });

            this.taskDocs.set(taskId, ydoc);

            // Register in graph
            if (!this.getNode('task', taskId)) {
                this.registerNode('task', taskId, this._taskMapToObject(taskMap));
            }
        }
        return this.taskDocs.get(taskId);
    }

    /**
     * Apply an operation to a task card through the CRDT.
     * Enforces conflict resolution policies.
     */
    applyTaskOperation(taskId, field, value, role = 'human', userId = null) {
        const ydoc = this.getTaskDocument(taskId);
        const taskMap = ydoc.getMap('task');

        // Check conflict resolution
        const conflictCheck = this._checkConflict('task', taskId, field, role, taskMap.get('updatedBy'));
        if (conflictCheck.blocked) {
            this.conflictLog.push({
                nodeId: `graph_task_${taskId}`,
                domain: 'task',
                action: `set ${field}`,
                role,
                userId,
                timestamp: new Date(),
                resolved: false,
                reason: conflictCheck.reason
            });
            this.emit('conflict:detected', conflictCheck);
            return { success: false, reason: conflictCheck.reason };
        }

        // Apply through Yjs (deterministic merge)
        ydoc.transact(() => {
            taskMap.set(field, value);
            taskMap.set('updatedBy', userId || role);
            taskMap.set('updatedAt', Date.now());
        });

        return { success: true };
    }

    /**
     * Load task state from Mongo into the CRDT graph.
     */
    async loadTaskFromDB(taskId) {
        const task = await TeamTask.findById(taskId).lean();
        if (!task) return null;

        const ydoc = this.getTaskDocument(taskId.toString());
        const taskMap = ydoc.getMap('task');

        ydoc.transact(() => {
            taskMap.set('status', task.status || 'todo');
            taskMap.set('priority', task.priority || 'medium');
            taskMap.set('description', task.description || '');
            taskMap.set('title', task.title || '');
        });

        return this.getNode('task', taskId.toString());
    }

    /**
     * Persist CRDT state back to Mongo.
     */
    async persistTaskToDB(taskId) {
        const node = this.getNode('task', taskId);
        if (!node) return null;

        const update = {
            status: node.data.status,
            priority: node.data.priority,
            description: node.data.description,
            title: node.data.title
        };

        return TeamTask.findByIdAndUpdate(taskId, update, { new: true });
    }

    // ─── Terminal State ─────────────────────────────────────────

    /**
     * Register terminal output as a graph node.
     * Links to the TerminalLog's stable refId.
     */
    registerTerminalOutput(sessionId, entry) {
        const key = `${sessionId}:${entry.refId}`;
        const node = this.registerNode('terminal', key, {
            sessionId,
            refId: entry.refId,
            type: entry.type,
            data: entry.data,
            timestamp: entry.timestamp
        });
        this.emit('terminal:registered', node);
        return node;
    }

    /**
     * Get all terminal output nodes for a session.
     */
    getTerminalNodes(sessionId) {
        const result = [];
        for (const [, node] of this.nodes) {
            if (node.domain === 'terminal' && node.data.sessionId === sessionId) {
                result.push(node);
            }
        }
        return result;
    }

    // ─── Cross-References ──────────────────────────────────────

    /**
     * Create a cross-reference between two graph nodes.
     * E.g., link a task to the file it modifies, or a terminal output to a task.
     */
    addCrossReference(fromNodeId, toNodeId, relation = 'related') {
        const from = this.nodes.get(fromNodeId);
        const to = this.nodes.get(toNodeId);
        if (!from || !to) return false;

        if (!from.references) from.references = [];
        from.references.push({ targetId: toNodeId, relation, createdAt: new Date() });

        if (!to.referencedBy) to.referencedBy = [];
        to.referencedBy.push({ sourceId: fromNodeId, relation, createdAt: new Date() });

        this.emit('cross-reference:added', { from: fromNodeId, to: toNodeId, relation });
        return true;
    }

    /**
     * Get all nodes that reference a given node.
     */
    getReferences(nodeId) {
        const node = this.nodes.get(nodeId);
        return node?.referencedBy || [];
    }

    // ─── Conflict Resolution ───────────────────────────────────

    /**
     * Check if an edit should be allowed based on conflict resolution policies.
     *
     * Policies:
     * 1. Agent edits are blocked during active human edits on the same field (last 5s)
     * 2. Agent edits to critical fields (status) require human approval
     * 3. Human edits always win over agent edits on conflict
     */
    _checkConflict(domain, key, field, editRole, lastUpdatedBy) {
        const now = Date.now();
        const node = this.getNode(domain, key);

        if (!node) return { blocked: false };

        // Policy 1: Agent blocked if human edited same field within 5s
        if (editRole === 'agent') {
            const timeSinceUpdate = now - node.updatedAt.getTime();
            if (timeSinceUpdate < 5000 && lastUpdatedBy && lastUpdatedBy !== 'agent') {
                return {
                    blocked: true,
                    reason: `Agent edit blocked: human edited ${field} ${timeSinceUpdate}ms ago`,
                    policy: 'HUMAN_PRIORITY'
                };
            }

            // Policy 2: Status changes by agents require approval
            if (field === 'status') {
                return {
                    blocked: true,
                    reason: 'Agent cannot change task status directly — requires human approval',
                    policy: 'STATUS_APPROVAL'
                };
            }
        }

        return { blocked: false };
    }

    /**
     * Get the conflict log for auditing.
     */
    getConflictLog(filter = {}) {
        let log = this.conflictLog;
        if (filter.domain) log = log.filter(c => c.domain === filter.domain);
        if (filter.role) log = log.filter(c => c.role === filter.role);
        if (filter.resolved !== undefined) log = log.filter(c => c.resolved === filter.resolved);
        return log;
    }

    // ─── Graph Queries ─────────────────────────────────────────

    /**
     * Get the full state graph for a workspace.
     */
    getGraphSummary() {
        const domains = { file: 0, task: 0, terminal: 0 };
        for (const [, node] of this.nodes) {
            domains[node.domain] = (domains[node.domain] || 0) + 1;
        }
        return {
            totalNodes: this.nodes.size,
            domains,
            conflicts: this.conflictLog.length,
            unresolvedConflicts: this.conflictLog.filter(c => !c.resolved).length
        };
    }

    /**
     * Get a node and its connected references (outgoing + incoming).
     */
    getNodeWithReferences(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;

        const outgoing = (node.references || []).map(ref => {
            const target = this.nodes.get(ref.targetId);
            return { ...ref, target };
        });

        const incoming = (node.referencedBy || []).map(ref => {
            const source = this.nodes.get(ref.sourceId);
            return { ...ref, source };
        });

        return { ...node, outgoing, incoming };
    }

    // ─── Internal Helpers ──────────────────────────────────────

    _taskMapToObject(taskMap) {
        const obj = {};
        taskMap.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
}

module.exports = new UnifiedStateGraph();
