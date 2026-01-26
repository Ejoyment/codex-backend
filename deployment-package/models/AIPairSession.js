const mongoose = require('mongoose');

const aiPairSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    repositoryId: {
        type: String,
        required: true
    },
    repositoryName: {
        type: String,
        required: true
    },
    repositoryOwner: {
        type: String,
        required: true
    },
    branch: {
        type: String,
        default: 'main'
    },
    sessionName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed', 'archived'],
        default: 'active'
    },
    filesAccessed: [{
        path: String,
        accessedAt: Date,
        operations: [String] // 'read', 'edit', 'create', 'delete'
    }],
    totalMessages: {
        type: Number,
        default: 0
    },
    totalEdits: {
        type: Number,
        default: 0
    },
    totalCommits: {
        type: Number,
        default: 0
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastActivityAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
});

// Index for faster queries
aiPairSessionSchema.index({ userId: 1, status: 1 });
aiPairSessionSchema.index({ repositoryId: 1 });

module.exports = mongoose.model('AIPairSession', aiPairSessionSchema);
