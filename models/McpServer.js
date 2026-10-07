const mongoose = require('mongoose');
const { encryptSecret, decryptSecret, isEncryptedSecret } = require('../utils/secretCrypto');

// env/headers routinely carry Authorization tokens and API keys, so the whole
// object is encrypted at rest (AES-256-GCM over its JSON). set encrypts on
// write, get decrypts on read; legacy plaintext objects pass through until
// their next write.
function encryptSecretObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    if (Object.keys(value).length === 0) return value;
    return encryptSecret(JSON.stringify(value));
}

function decryptSecretObject(value) {
    if (typeof value !== 'string' || !isEncryptedSecret(value)) return value;
    return JSON.parse(decryptSecret(value));
}

const mcpServerSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    transport: {
        type: String,
        enum: ['sse', 'stdio', 'streamable-http'],
        default: 'sse'
    },
    serverUrl: {
        type: String,
        default: ''
    },
    command: {
        type: String,
        default: ''
    },
    args: [{
        type: String
    }],
    env: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        set: encryptSecretObject,
        get: decryptSecretObject,
    },
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        set: encryptSecretObject,
        get: decryptSecretObject,
    },
    enabled: {
        type: Boolean,
        default: true
    },
    tools: [{
        name: { type: String },
        description: { type: String, default: '' }
    }],
    lastStatus: {
        type: String,
        enum: ['connected', 'unreachable', 'never', ''],
        default: ''
    },
    lastProbedAt: {
        type: Date
    },
    lastError: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// findOneAndUpdate-style writes bypass document setters — encrypt env/headers
// centrally so no write path can store them in plaintext.
function encryptSecretsInUpdate() {
    const update = this.getUpdate();
    if (!update) return;
    for (const section of [update, update.$set, update.$setOnInsert]) {
        if (!section || typeof section !== 'object') continue;
        if (section.env !== undefined) section.env = encryptSecretObject(section.env);
        if (section.headers !== undefined) section.headers = encryptSecretObject(section.headers);
    }
}
for (const hook of ['findOneAndUpdate', 'updateOne', 'updateMany']) {
    mcpServerSchema.pre(hook, function (next) {
        encryptSecretsInUpdate.call(this);
        next();
    });
}

mcpServerSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('McpServer', mcpServerSchema);