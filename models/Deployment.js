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
    // Workspace this deploy was launched from. Optional: a local project can
    // be deployed without any workspace. Stored so background self-heal can
    // scope its file edits without needing a live user/session.
    workspaceId: {
        type: String,
        default: null
    },
    // Deployment context from the Deployment page (Figma 718:67538). See
    // utils/deployContext.js — branch/environment/commit describe what the
    // deploy was launched from; framework/buildCommand/rootDirectory/
    // outputDirectory/region are the requested build settings shown back
    // on the details screen (the Docker build itself is auto-detected).
    branch: {
        type: String,
        default: null,
        trim: true
    },
    environment: {
        type: String,
        enum: ['Production', 'Preview'],
        default: null
    },
    commit: {
        type: String,
        default: null,
        trim: true
    },
    framework: {
        type: String,
        default: null,
        trim: true
    },
    buildCommand: {
        type: String,
        default: null,
        trim: true
    },
    rootDirectory: {
        type: String,
        default: null,
        trim: true
    },
    outputDirectory: {
        type: String,
        default: null,
        trim: true
    },
    region: {
        type: String,
        default: null,
        trim: true
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
        enum: ['node', 'python', 'go', 'ruby', 'php', 'rust', 'java', 'dotnet', 'elixir', 'swift', 'dart', 'static', 'docker', 'compose', 'unknown'],
        default: 'unknown'
    },
    // Environment variables injected into the container at run time. Secret
    // values are encrypted at rest when DEPLOY_ENV_KEY is set and are never
    // returned by the API (see utils/deployEnv.js).
    env: {
        type: [{
            key: { type: String, required: true },
            value: { type: String, default: '' },
            secret: { type: Boolean, default: false },
            encrypted: { type: Boolean, default: false }
        }],
        default: []
    },
    status: {
        type: String,
        enum: ['pending', 'building', 'deploying', 'success', 'failed', 'stopped'],
        default: 'pending'
    },
    buildRunId: {
        type: String,
        default: null
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
    // Background self-healing state. A failed deployment is scheduled here by
    // the deploy route / redeploy path and picked up by the self-heal worker,
    // which either retries platform faults or runs an agent to fix user-code
    // failures before redeploying. Null status = never scheduled.
    selfHeal: {
        status: {
            type: String,
            enum: ['pending', 'running', 'succeeded', 'failed', 'gave_up'],
            default: null
        },
        attempts: {
            type: Number,
            default: 0
        },
        lastAttemptAt: {
            type: Date,
            default: null
        },
        nextAttemptAt: {
            type: Date,
            default: null
        },
        completedAt: {
            type: Date,
            default: null
        },
        agentExecutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AgentExecution',
            default: null
        },
        summary: {
            type: String,
            default: null
        },
        // Latest human-readable line from the repair agent ("Step 2: read_file
        // succeeded."). Background runs have no browser attached, so this is
        // what the deployment API shows while the agent works.
        progress: {
            type: String,
            default: null
        },
        lastError: {
            type: String,
            default: null
        },
        // Env vars the repair agent determined are required but that only the
        // user can supply (secret values). Healing stops and the user is asked
        // to fill them in rather than the agent hardcoding anything.
        requiredEnv: {
            type: [{
                key: { type: String, required: true },
                reason: { type: String, default: null }
            }],
            default: []
        },
        // One-shot marker used by the poller to recover runs that failed for a
        // now-fixed reason (missing workspace, oversized prompt). It prevents
        // the same row from being requeued forever.
        recoveredAt: {
            type: Date,
            default: null
        }
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    expiresAt: {
        type: Date,
        default: null,
        index: true
    }
}, {
    timestamps: true
});

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ userId: 1, environment: 1, createdAt: -1 });
deploymentSchema.index({ userId: 1, branch: 1, createdAt: -1 });
deploymentSchema.index({ subdomain: 1 }, { unique: true });
deploymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Self-heal poller: due failures, scoped to the recent lookback window.
deploymentSchema.index({ status: 1, 'selfHeal.status': 1, 'selfHeal.nextAttemptAt': 1 });

module.exports = mongoose.model('Deployment', deploymentSchema);