const mongoose = require('mongoose');

const mcpServerSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    transport: {
        type: String,
        enum: ['sse', 'stdio', 'streamable-http'],
        default: 'sse'
    },
    serverUrl: {
        type: String,
        default: ''
    },
    command: {
        type: String,
        default: ''
    },
    args: [{
        type: String
    }],
    env: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    enabled: {
        type: Boolean,
        default: true
    },
    tools: [{
        name: { type: String },
        description: { type: String, default: '' }
    }],
    lastStatus: {
        type: String,
        enum: ['connected', 'unreachable', 'never', ''],
        default: ''
    },
    lastProbedAt: {
        type: Date
    },
    lastError: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

mcpServerSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('McpServer', mcpServerSchema);