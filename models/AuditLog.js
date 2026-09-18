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
    }
}, {
    timestamps: true
});

auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);