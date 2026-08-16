const mongoose = require('mongoose');

const debugHandoffSchema = new mongoose.Schema({
    handoffId: {
        type: String,
        unique: true,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    title: {
        type: String,
        required: true
    },
    description: String,
    source: {
        type: {
            type: String,
            enum: ['manual', 'debug-session', 'support-ticket', 'error-alert', 'ai-suggestion'],
            default: 'manual'
        },
        sourceId: String
    },
    codeSnapshot: {
        branch: String,
        commitSha: String,
        repository: String,
        fileId: String,
        filePath: String,
        content: String,
        language: String
    },
    runtimeState: {
        sessionId: String,
        variables: mongoose.Schema.Types.Mixed,
        callStack: [String],
        error: String,
        envSnapshot: mongoose.Schema.Types.Mixed
    },
    sandbox: {
        url: String,
        expiresAt: Date,
        branch: String,
        commitSha: String,
        status: {
            type: String,
            enum: ['provisioning', 'ready', 'expired', 'failed'],
            default: 'provisioning'
        }
    },
    access: {
        mode: {
            type: String,
            enum: ['link', 'company', 'invited'],
            default: 'link'
        },
        token: String,
        invitedUserIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    linkedTicketId: String,
    linkedMeetingId: String,
    resolvedAt: Date,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

debugHandoffSchema.index({ handoffId: 1 });
debugHandoffSchema.index({ createdBy: 1, status: 1 });
debugHandoffSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('DebugHandoff', debugHandoffSchema);
