const mongoose = require('mongoose');

// Ephemeral cloud sandbox provisioned for an Instant Bug Handoff. Captures the
// exact codebase state (repository, branch, commit), environment variables and a
// live, viewable preview URL. Lifecycle: provisioning -> cloning -> installing ->
// starting -> ready (or failed) -> expired.
const ephemeralSandboxSchema = new mongoose.Schema({
    handoffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DebugHandoff',
        default: null,
        index: true
    },
    sandboxKey: {
        type: String,
        unique: true,
        required: true,
        index: true
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
    repository: { type: String, default: null },
    branch: { type: String, default: 'main' },
    commitSha: { type: String, default: null },
    // Captured environment variables (values may be redacted for secrets)
    envVars: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Files restored into the sandbox (best-effort snapshot of the buggy state)
    files: [{
        path: String,
        language: String,
        content: String
    }],
    provider: {
        type: { type: String, enum: ['local', 'container'], default: 'local' },
        region: { type: String, default: 'local' }
    },
    status: {
        type: String,
        enum: ['provisioning', 'cloning', 'installing', 'starting', 'ready', 'failed', 'expired'],
        default: 'provisioning'
    },
    previewUrl: { type: String, default: null },
    ports: [{ type: Number }],
    workdir: { type: String, default: null },
    logs: { type: String, default: '' },
    error: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    readyAt: Date,
    failedAt: Date,
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, {
    timestamps: true
});

ephemeralSandboxSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('EphemeralSandbox', ephemeralSandboxSchema);
