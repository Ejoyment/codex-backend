const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    provider: {
        type: String,
        enum: ['github', 'figma', 'slack', 'vscode', 'notion', 'discord'],
        required: true
    },
    accessToken: {
        type: String,
        required: true
    },
    refreshToken: String,
    expiresAt: Date,
    providerUserId: String,
    providerUsername: String,
    providerEmail: String,
    scopes: [String],
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastSyncedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
integrationSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
integrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('Integration', integrationSchema);
