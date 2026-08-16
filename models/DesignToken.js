const mongoose = require('mongoose');

const designTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    figmaFileId: {
        type: String,
        required: true
    },
    figmaFileKey: {
        type: String,
        required: true
    },
    figmaNodeId: {
        type: String,
        default: null
    },
    tokenType: {
        type: String,
        enum: ['color', 'typography', 'spacing', 'shadow', 'borderRadius', 'layout', 'component', 'variable'],
        required: true
    },
    name: {
        type: String,
        required: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    mode: {
        type: String,
        default: 'default'
    },
    description: {
        type: String,
        default: ''
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

designTokenSchema.index({ userId: 1, figmaFileId: 1, tokenType: 1 });
designTokenSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('DesignToken', designTokenSchema);
