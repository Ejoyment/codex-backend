const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeamProject',
        default: null
    },
    // String copy of the project id (LocalProject or TeamProject) — populate()
    // on projectId nulls ids that don't exist in the TeamProject collection,
    // so this is what "redeploy this project's deployment" matches on.
    projectKey: {
        type: String,
        default: null
    },
    // owner/name of the GitHub repo this deployment came from (null for
    // workspace/local deploys) — lets the editor auto-redeploy on save.
    repoFullName: {
        type: String,
        default: null
    },
    subdomain: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    containerId: {
        type: String,
        default: null
    },
    runtime: {
        type: String,
        enum: ['node', 'python', 'go', 'ruby', 'php', 'static', 'docker', 'unknown'],
        default: 'unknown'
    },
    status: {
        type: String,
        enum: ['pending', 'building', 'deploying', 'success', 'failed', 'stopped'],
        default: 'pending'
    },
    errorMessage: {
        type: String,
        default: null
    },
    deployedUrl: {
        type: String,
        default: null
    },
    httpUrl: {
        type: String,
        default: null
    },
    buildLogs: {
        type: String,
        default: ''
    },
    // Tail of the container's stdout/stderr after start (success or crash) —
    // the Render-style "runtime logs" view.
    runtimeLogs: {
        type: String,
        default: ''
    },
    // Ordered deploy pipeline steps with per-step timing/status.
    steps: {
        type: [{
            name: String,
            status: { type: String, enum: ['pending', 'running', 'done', 'failed'] },
            detail: { type: String, default: null },
            startedAt: Date,
            finishedAt: Date
        }],
        default: []
    },
    // Failure attribution: 'user' = caused by the deployed codebase/Dockerfile
    // (build error, app crash), 'platform' = BuildrsHQ infrastructure issue.
    fault: {
        type: String,
        default: null
    },
    // Pipeline stage where the failure happened: validation | prepare |
    // build | start | platform.
    failureStage: {
        type: String,
        default: null
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ subdomain: 1 }, { unique: true });

module.exports = mongoose.model('Deployment', deploymentSchema);