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
const { addAuditLog } = require('../utils/auditLogService');

// List deployments for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Auto-fail stale deployments stuck in "building" for > 10 minutes
        // (e.g. the async deploy lost its callback on a server restart)
        const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
        await Deployment.updateMany(
            {
                userId: req.userId,
                status: { $in: ['pending', 'building', 'deploying'] },
                updatedAt: { $lt: staleThreshold }
            },
            {
                status: 'failed',
                errorMessage: 'Deployment timed out. Please try again.'
            }
        );

        const deployments = await Deployment.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .populate('projectId', 'name')
            .lean();

        res.json({ success: true, deployments });
    } catch (error) {
        console.error('List deployments error:', error);
        res.status(500).json({ error: 'Failed to fetch deployments' });
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
        }));

        if (!normalizedFiles.length) {
            return res.status(400).json({ error: 'Project has no deployable files.' });
        }

        let deployment = await Deployment.findOne({ subdomain: sanitized });
        if (deployment && deployment.userId.toString() !== req.userId.toString()) {
            return res.status(409).json({ error: 'Subdomain already taken by another user.' });
        }
        if (deployment) {
            deployment.userId = req.userId;
            deployment.projectId = projectId || null;
            deployment.status = 'building';
            deployment.errorMessage = null;
            deployment.deployedUrl = null;
            deployment.containerId = null;
            await deployment.save();
        } else {
            deployment = await Deployment.create({
                userId: req.userId,
                projectId: projectId || null,
                subdomain: sanitized,
                status: 'building'
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

        setImmediate(async () => {
            try {
                let containerId = null;
                let url = `https://${sanitized}.buildrshq.dev`;

                try {
                    const result = await depService.deployProject(sanitized, normalizedFiles);
                    containerId = result.containerId;
                    url = result.url || url;
                } catch (depErr) {
                    console.error(`[deploy] ${sanitized} failed:`, depErr.message);
                    await Deployment.findByIdAndUpdate(deployId, {
                        status: 'failed',
                        errorMessage: depErr.message
                    });
                    return;
                }

                await Deployment.findByIdAndUpdate(deployId, {
                    containerId,
                    deployedUrl: url,
                    status: 'success'
                });
                console.log(`[deploy] ${sanitized}.buildrshq.dev is live`);
            } catch (err) {
                console.error(`[deploy] ${sanitized} failed:`, err.message);
                await Deployment.findByIdAndUpdate(deployId, {
                    status: 'failed',
                    errorMessage: err.message
                });
            }
        });

        res.status(201).json({
            success: true,
            deployment: {
                ...deployment.toObject(),
                deployedUrl: `https://${sanitized}.buildrshq.dev`
            }
        });
    } catch (error) {
        console.error('Create deployment error:', error);
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

        // Mark as stopped in DB
        deployment.status = 'stopped';
        deployment.deployedUrl = null;
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