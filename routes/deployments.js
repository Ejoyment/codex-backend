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

// List deployments for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
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
        const { projectId, subdomain, companyId } = req.body;

        if (!projectId || !subdomain) {
            return res.status(400).json({ error: 'projectId and subdomain are required' });
        }

        // Fail fast with a clear message if the deployment backend isn't configured
        if (!process.env.DEPLOY_SSH_HOST || (!process.env.DEPLOY_SSH_KEY && !process.env.DEPLOY_SSH_KEY_FILE)) {
            return res.status(503).json({
                error: 'Deployment backend is not configured. Set DEPLOY_SSH_HOST and DEPLOY_SSH_KEY (or DEPLOY_SSH_KEY_FILE) environment variables on the server.'
            });
        }

        const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (!sanitized || sanitized.length < 2) {
            return res.status(400).json({ error: 'Subdomain must be at least 2 characters (a-z, 0-9, hyphens)' });
        }

        // Verify the user owns the project — accept either a local project or a team project
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

        const project = localProject || teamProject;

        // Determine which workspace/company the files are stored under
        const workspaceId = project.workspaceId || companyId || project.company?.toString();

        // Collect files for the project — prefer project-scoped files, fall back to workspace-scoped files
        let files = await CodeFile.find({ project: projectId }).lean();
        if (files.length === 0 && workspaceId) {
            files = await CodeFile.find({ company: workspaceId }).lean();
        }
        if (files.length === 0) {
            return res.status(400).json({ error: 'Project has no files to deploy. Create a file in the editor first.' });
        }

        // Reuse an existing deployment for this subdomain (re-deploy) instead of
        // failing on the unique index — but never touch another user's deployment.
        let deployment = await Deployment.findOne({ subdomain: sanitized });
        if (deployment && deployment.userId.toString() !== req.userId.toString()) {
            return res.status(409).json({ error: 'Subdomain already taken by another user.' });
        }
        if (deployment) {
            deployment.userId = req.userId;
            deployment.projectId = projectId;
            deployment.status = 'building';
            deployment.errorMessage = null;
            deployment.deployedUrl = null;
            deployment.containerId = null;
            await deployment.save();
        } else {
            deployment = await Deployment.create({
                userId: req.userId,
                projectId,
                subdomain: sanitized,
                status: 'building'
            });
        }

        const deployId = deployment._id;

        // Run deployment asynchronously
        setImmediate(async () => {
            try {
                const fileData = files.map(f => ({
                    name: f.name,
                    path: f.path || '/',
                    content: f.content || '',
                }));

                let containerId = null;
                let url = `https://${sanitized}.buildrshq.dev`;

                try {
                    const result = await depService.deployProject(sanitized, fileData);
                    containerId = result.containerId;
                    url = result.url || url;
                } catch (depErr) {
                    // Deployment infra may not be reachable — mark as failed but keep the record
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

        res.json({ success: true, message: 'Deployment stopped and cleaned up' });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({ message: 'Failed to stop deployment: ' + (error.message || 'unknown error') });
    }
});

module.exports = router;