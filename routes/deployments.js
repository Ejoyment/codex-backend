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
        if (!process.env.DEPLOY_SSH_HOST || !process.env.DEPLOY_SSH_KEY) {
            return res.status(503).json({
                error: 'Deployment backend is not configured. Set DEPLOY_SSH_HOST and DEPLOY_SSH_KEY environment variables on the server.'
            });
        }

        const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (!sanitized || sanitized.length < 2) {
            return res.status(400).json({ error: 'Subdomain must be at least 2 characters (a-z, 0-9, hyphens)' });
        }

        // Verify the user owns the project — accept either a local project or a team project
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

        // Create deployment record (pending)
        const deployment = await Deployment.create({
            userId: req.userId,
            projectId,
            subdomain: sanitized,
            status: 'building'
        });

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
        res.status(500).json({ error: 'Failed to start deployment' });
    }
});

// Delete/stop a deployment
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ _id: req.params.id, userId: req.userId });
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        // Stop the Docker container
        if (deployment.subdomain) {
            await depService.stopDeployment(deployment.subdomain);
        }

        // Mark as stopped in DB
        deployment.status = 'stopped';
        deployment.deployedUrl = null;
        await deployment.save();

        res.json({ message: 'Deployment stopped and cleaned up' });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({ error: 'Failed to stop deployment' });
    }
});

module.exports = router;