const mongoose = require('mongoose');

const terminalLogSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    entries: [{
        refId: {
            type: mongoose.Schema.Types.ObjectId,
            default: () => new mongoose.Types.ObjectId()
        },
        type: {
            type: String,
            enum: ['input', 'output', 'error'],
            required: true
        },
        data: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    commandCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'ended', 'expired'],
        default: 'active'
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
}, {
    timestamps: true
});

terminalLogSchema.index({ sessionId: 1, createdAt: -1 });
terminalLogSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('TerminalLog', terminalLogSchema);
