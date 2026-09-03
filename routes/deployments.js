/**
 * Deployments API Routes
 * Spins up real Docker containers on the Hetzner VPS via SSH.
 */

const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const TeamProject = require('../models/TeamProject');
const CodeFile = require('../models/CodeFile');
const { authenticateToken } = require('../middleware/auth');
const depService = require('../utils/deploymentService');

// List deployments for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const deployments = await Deployment.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .populate('projectId', 'name');

        res.json({ deployments });
    } catch (error) {
        console.error('List deployments error:', error);
        res.status(500).json({ error: 'Failed to fetch deployments' });
    }
});

// Create a new deployment (spins up a real Docker container)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { projectId, subdomain } = req.body;

        if (!projectId || !subdomain) {
            return res.status(400).json({ error: 'projectId and subdomain are required' });
        }

        const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (!sanitized || sanitized.length < 2) {
            return res.status(400).json({ error: 'Subdomain must be at least 2 characters (a-z, 0-9, hyphens)' });
        }

        // Verify project exists and user has access
        const project = await TeamProject.findOne({ _id: projectId, owner: req.userId });
        if (!project) {
            return res.status(404).json({ error: 'Project not found or not owned by you' });
        }

        // Check subdomain availability
        try {
            const taken = await depService.isSubdomainTaken(sanitized);
            if (taken) {
                return res.status(409).json({ error: 'Subdomain already taken. Choose another.' });
            }
        } catch (_) {
            // If SSH check fails, we still proceed (first deployment may be setting things up)
            console.warn('[deploy] Could not check subdomain, continuing anyway');
        }

        // Get all files in this project
        const files = await CodeFile.find({ project: projectId });
        if (files.length === 0) {
            return res.status(400).json({ error: 'Project has no files to deploy' });
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

                // Deploy to VPS
                const { containerId, url } = await depService.deployProject(sanitized, fileData);

                await Deployment.findByIdAndUpdate(deployId, {
                    containerId,
                    deployedUrl: url,
                    status: 'success'
                });
                console.log(`[deploy] ✅ ${sanitized}.buildrshq.dev is live`);
            } catch (err) {
                console.error(`[deploy] ❌ ${sanitized} failed:`, err.message);
                await Deployment.findByIdAndUpdate(deployId, {
                    status: 'failed',
                    errorMessage: err.message
                });
            }
        });

        res.status(201).json({
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