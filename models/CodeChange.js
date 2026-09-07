const mongoose = require('mongoose');

const codeChangeSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AIPairSession',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatMessage'
    },
    filePath: {
        type: String,
        required: true
    },
    operation: {
        type: String,
        enum: ['create', 'edit', 'delete', 'rename'],
        required: true
    },
    oldContent: String,
    newContent: String,
    diff: String,
    status: {
        type: String,
        enum: ['pending', 'approved', 'applied', 'rejected', 'reverted'],
        default: 'pending'
    },
    commitSha: String,
    appliedAt: Date,
    revertedAt: Date,
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
codeChangeSchema.index({ sessionId: 1, status: 1 });
codeChangeSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CodeChange', codeChangeSchema);
