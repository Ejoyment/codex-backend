const mongoose = require('mongoose');

const integrationDataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platform: {
        type: String,
        enum: ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'],
        required: true
    },
    dataType: {
        type: String,
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    lastSynced: {
        type: Date,
        default: Date.now
    },
    syncStatus: {
        type: String,
        enum: ['success', 'error', 'pending'],
        default: 'pending'
    },
    metadata: {
        totalItems: { type: Number, default: 0 },
        unreadCount: { type: Number, default: 0 },
        lastActivity: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
integrationDataSchema.index({ userId: 1, platform: 1, dataType: 1 });

module.exports = mongoose.model('IntegrationData', integrationDataSchema);
