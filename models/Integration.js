const mongoose = require('mongoose');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');

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
    // OAuth tokens are encrypted at rest (AES-256-GCM, see utils/secretCrypto).
    // set encrypts on write, get decrypts on read; values without the v1:
    // prefix are legacy plaintext and pass through until their next write.
    accessToken: {
        type: String,
        required: true,
        set: encryptSecret,
        get: decryptSecret,
    },
    refreshToken: {
        type: String,
        set: encryptSecret,
        get: decryptSecret,
    },
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

// findOneAndUpdate / updateOne bypass document setters, and every OAuth
// callback upserts tokens that way — encrypt token fields centrally so no
// write site can store them in plaintext.
function encryptTokenFieldsInUpdate() {
    const update = this.getUpdate();
    if (!update) return;
    for (const section of [update, update.$set, update.$setOnInsert]) {
        if (!section || typeof section !== 'object') continue;
        if (typeof section.accessToken === 'string') {
            section.accessToken = encryptSecret(section.accessToken);
        }
        if (typeof section.refreshToken === 'string') {
            section.refreshToken = encryptSecret(section.refreshToken);
        }
    }
}
integrationSchema.pre('findOneAndUpdate', function (next) {
    encryptTokenFieldsInUpdate.call(this);
    next();
});
integrationSchema.pre('updateOne', function (next) {
    encryptTokenFieldsInUpdate.call(this);
    next();
});
integrationSchema.pre('updateMany', function (next) {
    encryptTokenFieldsInUpdate.call(this);
    next();
});

// Index for faster queries
integrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('Integration', integrationSchema);
