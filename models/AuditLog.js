const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    email: {
        type: String,
        default: ''
    },
    event: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['auth', 'team', 'billing', 'deployment', 'code', 'git', 'ai', 'integration', 'system'],
        default: 'system'
    },
    target: {
        type: String,
        default: ''
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ip: {
        type: String,
        default: ''
    },
    // Retention policy (rec 11): audit rows expire after AUDIT_LOG_RETENTION_DAYS
    // (default 90). Compliance windows longer than that need an export pipeline
    // first — see recommendations §4.7, still an open team decision.
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10) * 24 * 60 * 60 * 1000))
    }
}, {
    timestamps: true
});

auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
// TTL: rows die when expiresAt passes.
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuditLog', auditLogSchema);