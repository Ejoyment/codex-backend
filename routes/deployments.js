/**
 * Deployments API Routes
 * Spins up real Docker containers on the Hetzner VPS via SSH.
 */

const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const TeamProject = require('../models/TeamProject');
const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const { authenticateToken } = require('../middleware/auth');
const depService = require('../utils/deploymentService');
const { validateDeployFiles, backfillFileContent, limits: deployLimits } = require('../utils/deployContent');
const { addAuditLog } = require('../utils/auditLogService');

// Keep in sync with DEPLOY_TIMEOUT_MS in utils/deploymentService.js — that is
// the SSH-side command timeout (the docker build itself). The HTTP-side race
// adds slack so the SSH timeout (and its clearer error) fires first.
const DEPLOY_TIMEOUT = parseInt(process.env.DEPLOY_TIMEOUT_MS) || 900000;
const DEPLOY_RACE_TIMEOUT = DEPLOY_TIMEOUT + 300000;
// A deployment still in a non-terminal state after this long lost its async
// callback (server restart) — sweep it to failed. Must exceed
// DEPLOY_RACE_TIMEOUT so an in-flight build is never marked stale.
const STALE_DEPLOY_MS = DEPLOY_TIMEOUT + 600000;

// Build errors can be huge (a full buildkit trace runs to several KB); keep
// the stored message readable — head holds the failure reason, tail the end.
function capErrorMessage(msg) {
    const s = String(msg || 'Deployment failed');
    if (s.length <= 4500) return s;
    return `${s.slice(0, 1300)}\n... [truncated ${s.length - 4500} chars] ...\n${s.slice(-3200)}`;
}

// The Render-style pipeline steps shown in the deploy log viewer.
const INITIAL_STEPS = () => ([
    { name: 'prepare', status: 'pending' },
    { name: 'build', status: 'pending' },
    { name: 'deploy', status: 'pending' },
    { name: 'verify', status: 'pending' },
]);

// Attribute a failure raised BEFORE the pipeline started (backfill,
// re-validation, runtime detection).
function classifyPreDeployError(err) {
    const msg = String(err.message || '');
    if (/limit|Invalid file path|no deployable/i.test(msg)) return { fault: 'user', failureStage: 'validation' };
    if (/github|integration|repository|token|backfill/i.test(msg)) return { fault: 'user', failureStage: 'prepare' };
    return { fault: 'platform', failureStage: 'prepare' };
}

// List deployments for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Auto-fail stale deployments stuck in a non-terminal state (e.g.
        // the async deploy lost its callback on a server restart). The
        // threshold sits comfortably above the deploy race timeout so an
        // in-flight build is never swept.
        const staleThreshold = new Date(Date.now() - STALE_DEPLOY_MS);
        await Deployment.updateMany(
            {
                userId: req.userId,
                status: { $in: ['pending', 'building', 'deploying'] },
                updatedAt: { $lt: staleThreshold }
            },
            {
                status: 'failed',
                errorMessage: 'Deployment timed out. Please try again.',
                fault: 'platform',
                failureStage: 'platform',
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        );

        // List view never needs the log payloads — they can be hundreds of KB.
        const deployments = await Deployment.find({ userId: req.userId })
            .select('-buildLogs -runtimeLogs')
            .sort({ createdAt: -1 })
            .populate('projectId', 'name')
            .lean();

        res.json({ success: true, deployments });
    } catch (error) {
        console.error('List deployments error:', error);
        res.status(500).json({ error: 'Failed to fetch deployments' });
    }
});

// Deployment detail — polled by the log viewer while a deploy is in flight
// (build log, runtime log, step timeline, fault attribution).
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid deployment id' });
        }
        const deployment = await Deployment.findOne({ _id: id, userId: req.userId })
            .populate('projectId', 'name')
            .lean();
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        res.json({ success: true, deployment });
    } catch (error) {
        console.error('Get deployment error:', error);
        res.status(500).json({ error: 'Failed to fetch deployment' });
    }
});

// Create a new deployment (spins up a real Docker container)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { projectId, subdomain, companyId, source, repo, files: directFiles } = req.body;

        if (!subdomain) {
            return res.status(400).json({ error: 'subdomain is required' });
        }

        // Fail fast with a clear message if the deployment backend isn't configured
        if (!process.env.DEPLOY_SSH_HOST || (!process.env.DEPLOY_SSH_KEY && !process.env.DEPLOY_SSH_KEY_FILE)) {
            return res.status(503).json({
                error: 'Deployment backend is not configured. Set DEPLOY_SSH_HOST and DEPLOY_SSH_KEY (or DEPLOY_SSH_KEY_FILE) environment variables on the server.'
            });
        }

        const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        // Strict subdomain validation: must start/end with alphanumeric, 2-63 chars, no consecutive hyphens
        if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(sanitized)) {
            return res.status(400).json({ error: 'Invalid subdomain: must be 2-63 chars, start/end with alphanumeric, no consecutive hyphens' });
        }
        // Block reserved names
        const reserved = ['www', 'api', 'admin', 'root', 'mail', 'ftp', 'localhost', 'null', 'undefined'];
        if (reserved.includes(sanitized)) {
            return res.status(400).json({ error: 'Subdomain is reserved' });
        }

        let files = Array.isArray(directFiles) && directFiles.length ? directFiles : [];
        let project = null;
        let workspaceId = companyId || null;

        if (projectId) {
            const validId = typeof projectId === 'string' && /^[0-9a-fA-F]{24}$/.test(projectId);
            if (!validId) {
                return res.status(400).json({ error: 'Invalid projectId' });
            }

            const localProject = await LocalProject.findOne({ _id: projectId, userId: req.userId }).lean();
            const teamProject = !localProject
                ? await TeamProject.findOne({ _id: projectId, owner: req.userId }).lean()
                : null;

            if (!localProject && !teamProject) {
                return res.status(404).json({ error: 'Project not found or not owned by you' });
            }

            project = localProject || teamProject;
            workspaceId = project.workspaceId || companyId || project.company?.toString() || workspaceId;
            files = files.length ? files : await CodeFile.find({ project: projectId }).lean();
            if (files.length === 0 && workspaceId) {
                files = await CodeFile.find({ company: workspaceId }).lean();
            }
        }

        if (files.length === 0 && !projectId && !Array.isArray(directFiles)) {
            return res.status(400).json({ error: 'No files available to deploy. Select a project, repo, or file in the explorer first.' });
        }

        if (files.length === 0 && Array.isArray(directFiles) && directFiles.length === 0) {
            return res.status(400).json({ error: 'Project has no files to deploy. Create a file in the editor first.' });
        }

        const normalizedFiles = files.map(f => ({
            name: f.name,
            path: f.path || '/',
            content: typeof f.content === 'string' ? f.content : (f.content || ''),
            language: f.language || 'plaintext',
            sha: f.sha || undefined,
            encoding: f.encoding === 'base64' ? 'base64' : undefined,
        }));

        if (!normalizedFiles.length) {
            return res.status(400).json({ error: 'Project has no deployable files.' });
        }

        // Env-configurable caps (count, per-file, total) + path safety —
        // replaces the old hard 200-file / 1MB-per-file / strict-regex checks
        // that rejected large repos and names with spaces or unicode.
        try {
            validateDeployFiles(normalizedFiles);
        } catch (valErr) {
            return res.status(400).json({ error: valErr.message });
        }

        let deployment = await Deployment.findOne({ subdomain: sanitized });
        if (deployment && deployment.userId.toString() !== req.userId.toString()) {
            return res.status(409).json({ error: 'Subdomain already taken by another user.' });
        }
        const repoFullName = repo
            ? (repo.fullName || (repo.owner && repo.name ? `${repo.owner}/${repo.name}` : null))
            : null;
        const projectKey = projectId ? String(projectId) : null;
        if (deployment) {
            deployment.userId = req.userId;
            deployment.projectId = projectId || null;
            deployment.projectKey = projectKey;
            deployment.repoFullName = repoFullName;
            deployment.status = 'building';
            deployment.errorMessage = null;
            deployment.deployedUrl = null;
            deployment.containerId = null;
            deployment.fault = null;
            deployment.failureStage = null;
            deployment.buildLogs = '';
            deployment.runtimeLogs = '';
            deployment.steps = INITIAL_STEPS();
            await deployment.save();
        } else {
            deployment = await Deployment.create({
                userId: req.userId,
                projectId: projectId || null,
                projectKey,
                repoFullName,
                subdomain: sanitized,
                status: 'building',
                steps: INITIAL_STEPS()
            });
        }

        const deployId = deployment._id;

        addAuditLog({
            companyId: workspaceId || null,
            actorId: req.userId,
            event: 'deployment.created',
            category: 'deployment',
            target: `${sanitized}.buildrshq.dev`,
            details: { projectId: projectId || null, deployment: deployId.toString(), source: source || 'local' },
            req
        });

        // Send immediate response so client isn't blocked by docker build time
        res.status(201).json({
            success: true,
            deployment: {
                ...deployment.toObject(),
                deployedUrl: null,
                httpUrl: null
            }
        });

        setImmediate(async () => {
            // ---- Observability state (Render-style log streaming) ----
            let buildLog = '';
            let logFlushTimer = null;
            let finished = false;
            let liveSteps = INITIAL_STEPS();

            const flushLogs = async () => {
                logFlushTimer = null;
                if (finished || !buildLog) return;
                try {
                    await Deployment.updateOne({ _id: deployId }, { buildLogs: depService.capLogTail(buildLog) });
                } catch (flushErr) {
                    console.warn('[deploy] build log flush failed:', flushErr.message);
                }
            };
            const persistSteps = async (extra = {}) => {
                if (finished) return;
                try {
                    await Deployment.updateOne({ _id: deployId }, { steps: liveSteps, ...extra });
                } catch (e) {
                    console.warn('[deploy] steps persist failed:', e.message);
                }
            };

            const deployHooks = {
                onLog: chunk => {
                    if (finished) return;
                    buildLog += chunk;
                    // Bound memory during long builds (keep head + recent tail).
                    if (buildLog.length > 1200000) {
                        buildLog = `${buildLog.slice(0, 150000)}\n... [earlier build output omitted] ...\n${buildLog.slice(-900000)}`;
                    }
                    if (!logFlushTimer) logFlushTimer = setTimeout(flushLogs, 1200);
                },
                onStep: ({ name, status, detail }) => {
                    if (finished) return;
                    const step = liveSteps.find(s => s.name === name);
                    const now = new Date();
                    if (step) {
                        if (status === 'running') {
                            step.status = 'running';
                            step.startedAt = now;
                            if (detail) step.detail = detail;
                        } else if (status === 'done' || status === 'failed') {
                            step.status = status;
                            step.finishedAt = now;
                            if (detail) step.detail = detail;
                        }
                    }
                    const extra = {};
                    if (name === 'deploy' && status === 'running') extra.status = 'deploying';
                    persistSteps(extra);
                },
            };

            const persistFailure = async (depErr) => {
                finished = true;
                if (logFlushTimer) { clearTimeout(logFlushTimer); logFlushTimer = null; }
                const failedStep = liveSteps.find(s => s.status === 'running');
                // Mark every in-flight step failed (normally only the last one
                // is running; deploy completes before verify starts). Steps
                // still pending never ran — leave them pending.
                liveSteps.forEach(s => {
                    if (s.status === 'running') {
                        s.status = 'failed';
                        s.finishedAt = new Date();
                    }
                });
                const timedOut = depErr && depErr.message === 'Deployment timed out';
                // DeployError carries explicit stage/fault; timeouts are
                // attributed by whichever step was still running (a hung or
                // endless build is the user's build; a hang before/after is
                // our infrastructure); anything else unexpected is platform.
                let fault = depErr && depErr.fault;
                let failureStage = depErr && depErr.stage;
                if (!fault && timedOut) {
                    const inFlight = failedStep || liveSteps.find(s => s.status === 'running');
                    const isBuild = inFlight && inFlight.name === 'build';
                    fault = isBuild ? 'user' : 'platform';
                    failureStage = isBuild ? 'build' : (inFlight ? inFlight.name : 'platform');
                } else if (!fault) {
                    fault = 'platform';
                    failureStage = failureStage || 'platform';
                }
                if (timedOut) {
                    const mins = Math.round(DEPLOY_RACE_TIMEOUT / 60000);
                    const what = failedStep ? ` while "${failedStep.name}" was running` : '';
                    depErr = Object.assign(new Error(`Deployment timed out after ${mins} minutes${what}. ` +
                        (fault === 'user'
                            ? 'Your build or startup exceeded the time limit.'
                            : 'Our build infrastructure did not respond in time — please retry.')), { fault, stage: failureStage });
                }
                const logTail = buildLog
                    ? `${buildLog}\n--- DEPLOYMENT FAILED ---\n${depErr.message}\n`
                    : `--- DEPLOYMENT FAILED ---\n${depErr.message}\n`;
                try {
                    await Deployment.findByIdAndUpdate(deployId, {
                        status: 'failed',
                        errorMessage: capErrorMessage(depErr.message),
                        fault,
                        failureStage: failureStage || 'platform',
                        steps: liveSteps,
                        buildLogs: depService.capLogTail(logTail),
                        // Failed deployments expire via the TTL index so the
                        // collection doesn't accumulate dead build records.
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        ...(depErr.runtimeLogs ? { runtimeLogs: String(depErr.runtimeLogs).slice(-200000) } : {}),
                    });
                } catch (saveErr) {
                    console.error('[deploy] failed to persist failure state:', saveErr.message);
                }
            };

            try {
                // File lists from the project API and GitHub tree are metadata-only;
                // pull real content (DB or GitHub) before building the image.
                // Backfill has its own deadline so a slow GitHub fetch can't
                // outlive the deploy timeout.
                const backfillDeadline = Date.now() + Math.min(
                    deployLimits().backfillTimeoutMs,
                    Math.floor(DEPLOY_TIMEOUT * 0.6)
                );
                await backfillFileContent({
                    userId: req.userId,
                    projectId,
                    workspaceId,
                    source,
                    repo,
                    files: normalizedFiles,
                    deadline: backfillDeadline
                });

                // Re-validate now that real content is present (backfilled
                // bytes never went through the request-size caps above).
                validateDeployFiles(normalizedFiles);

                // Record the detected runtime + build context up front so a
                // failed deploy still shows what was detected instead of
                // leaving runtime: 'unknown'.
                try {
                    const detected = depService.detectRuntime(normalizedFiles);
                    await Deployment.findByIdAndUpdate(deployId, {
                        runtime: detected.runtime,
                        'metadata.contextDir': detected.contextDir
                    });
                } catch (detectErr) {
                    console.warn('[deploy] runtime detection persist failed:', detectErr.message);
                }

                let containerId = null;
                let url = `https://${sanitized}.buildrshq.dev`;
                let httpUrl = `http://${sanitized}.buildrshq.dev`;
                let runtimeLogs = '';

                const deployPromise = depService.deployProject(sanitized, normalizedFiles, deployHooks);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Deployment timed out')), DEPLOY_RACE_TIMEOUT)
                );

                let result;
                try {
                    result = await Promise.race([deployPromise, timeoutPromise]);
                    containerId = result.containerId;
                    url = result.url || url;
                    runtimeLogs = result.runtimeLogs || '';
                } catch (depErr) {
                    console.error(`[deploy] ${sanitized} failed:`, depErr.message);
                    await persistFailure(depErr);
                    return;
                }

                finished = true;
                if (logFlushTimer) { clearTimeout(logFlushTimer); logFlushTimer = null; }
                // Service emitted each step; make sure none are left dangling.
                liveSteps.forEach(s => {
                    if (s.status !== 'done') {
                        s.status = 'done';
                        s.finishedAt = new Date();
                    }
                });
                await Deployment.findByIdAndUpdate(deployId, {
                    containerId,
                    deployedUrl: url,
                    httpUrl,
                    status: 'success',
                    fault: null,
                    failureStage: null,
                    errorMessage: null,
                    steps: liveSteps,
                    buildLogs: depService.capLogTail(buildLog),
                    runtimeLogs: String(runtimeLogs).slice(-200000),
                });
                console.log(`[deploy] ${sanitized}.buildrshq.dev is live`);
            } catch (err) {
                console.error(`[deploy] ${sanitized} failed:`, err.message);
                const { fault, failureStage } = classifyPreDeployError(err);
                await persistFailure(Object.assign(err, { fault, stage: failureStage }));
            }
        });
        return;
    } catch (error) {
        console.error('Create deployment error:', error);
        if (res.headersSent) return;
        const msg = error.code === 11000
            ? 'A deployment with this subdomain already exists.'
            : error.message || 'Failed to start deployment';
        res.status(500).json({ error: 'Failed to start deployment: ' + msg });
    }
});

// Delete/stop a deployment
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid deployment id' });
        }

        const deployment = await Deployment.findOne({ _id: id, userId: req.userId });
        if (!deployment) {
            return res.status(404).json({ message: 'Deployment not found' });
        }

        // Stop the Docker container (best-effort — never block the DB update on it)
        if (deployment.subdomain) {
            try {
                await depService.stopDeployment(deployment.subdomain);
            } catch (stopErr) {
                console.warn('[deploy] Could not reach VPS to stop container:', stopErr.message);
            }
        }

        // Mark as stopped in DB (expires in 30d via TTL index)
        deployment.status = 'stopped';
        deployment.deployedUrl = null;
        deployment.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await deployment.save();

        let stopCompanyId = null;
        try {
            const proj = deployment.projectId
                ? (await LocalProject.findOne({ _id: deployment.projectId }).lean())
                    || (await TeamProject.findOne({ _id: deployment.projectId }).lean())
                : null;
            stopCompanyId = proj?.workspaceId || proj?.company?.toString() || null;
        } catch {}
        addAuditLog({
            companyId: stopCompanyId,
            actorId: req.userId,
            event: 'deployment.stopped',
            category: 'deployment',
            target: deployment.subdomain ? `${deployment.subdomain}.buildrshq.dev` : '',
            details: { deploymentId: id },
            req
        });

        res.json({ success: true, message: 'Deployment stopped and cleaned up' });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({ message: 'Failed to stop deployment: ' + (error.message || 'unknown error') });
    }
});

module.exports = router;