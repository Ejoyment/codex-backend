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
    },
    // Retention: shareable handoff links expire (default 30d).
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (parseInt(process.env.DEBUG_HANDOFF_TTL_DAYS || '30', 10) * 24 * 60 * 60 * 1000))
    }
}, {
    timestamps: true
});

debugHandoffSchema.index({ handoffId: 1 });
// There is no top-level `status` field (only sandbox.status) — the old
// { createdBy, status } index could never match a query. Index recency instead.
debugHandoffSchema.index({ createdBy: 1, createdAt: -1 });
debugHandoffSchema.index({ companyId: 1, createdAt: -1 });
// TTL: rows die when expiresAt passes.
debugHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('DebugHandoff', debugHandoffSchema);
