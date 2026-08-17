const mongoose = require('mongoose');

// Live Design-Code Split View session. Links a Figma frame/node to a code file and
// tracks the latest design-parity analysis (score + per-property diffs).
const designSyncSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    figmaFileKey: { type: String, default: null },
    nodeId: { type: String, default: null },
    figmaNodeName: { type: String, default: null },
    codeFileId: { type: String, default: null },
    codeLanguage: { type: String, default: 'plaintext' },
    // Most recent parity analysis
    parity: {
        score: { type: Number, default: 0 }, // 0-100
        checkedAt: Date,
        items: [{
            key: String,
            label: String,
            figmaValue: mongoose.Schema.Types.Mixed,
            codeValue: mongoose.Schema.Types.Mixed,
            status: { type: String, enum: ['matched', 'mismatch', 'missing'], default: 'missing' },
            tolerance: Number
        }]
    },
    status: {
        type: String,
        enum: ['active', 'ended'],
        default: 'active'
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date
}, {
    timestamps: true
});

designSyncSessionSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('DesignSyncSession', designSyncSessionSchema);
