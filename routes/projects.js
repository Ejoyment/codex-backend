const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { enforceProjectLimit } = require('../middleware/trial');
const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get user's local projects
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's local projects
 *       401:
 *         description: Unauthorized
 */
// Get all user's local projects
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const projects = await LocalProject.find({ 
            userId, 
            isArchived: false 
        }).sort({ updatedAt: -1 });

        res.json({
            success: true,
            projects: projects.map(p => ({
                id: p._id,
                name: p.name,
                description: p.description,
                status: p.status,
                priority: p.priority,
                progress: p.progress,
                tags: p.tags,
                isGitEnabled: p.isGitEnabled,
                pushedToGitHub: p.pushedToGitHub,
                githubRepoUrl: p.githubRepoUrl,
                workspaceId: p.workspaceId,
                members: p.members,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ success: false, message: 'Error fetching projects' });
    }
});

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new local project
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Project created successfully
 *       401:
 *         description: Unauthorized
 */
// Create local project
router.post('/', authenticateToken, enforceProjectLimit, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { name, description, priority, tags } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Project name is required' });
        }

        const project = await LocalProject.create({
            userId,
            name,
            description: description || '',
            priority: priority || 'medium',
            tags: tags || [],
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            project
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ success: false, message: 'Error creating project' });
    }
});

// ============ STANDALONE TASKS (must come before /:projectId routes) ============

/**
 * @swagger
 * /api/projects/tasks:
 *   get:
 *     summary: Get all user's tasks (local + integrated)
 *     tags:
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user tasks
 */
// Get all user tasks
router.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const tasks = await LocalTask.find({ 
            userId, 
            status: { $ne: 'archived' } 
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            tasks: tasks.map(t => ({
                id: t._id,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                taskType: t.taskType,
                projectId: t.projectId,
                dueDate: t.dueDate,
                labels: t.labels,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ success: false, message: 'Error fetching tasks' });
    }
});

/**
 * @swagger
 * /api/projects/tasks:
 *   post:
 *     summary: Create a standalone local task
 *     tags:
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *               taskType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 */
// Create standalone task
router.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { title, description, priority, taskType, dueDate, projectId } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const task = await LocalTask.create({
            userId,
            title,
            description: description || '',
            priority: priority || 'medium',
            taskType: taskType || 'local',
            dueDate: dueDate ? new Date(dueDate) : null,
            projectId: projectId || null,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            task
        });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: 'Error creating task' });
    }
});

/**
 * @swagger
 * /api/projects/tasks/{taskId}:
 *   put:
 *     summary: Update a task status
 *     tags:
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in-progress, in_review, completed, archived]
 *     responses:
 *       200:
 *         description: Task updated successfully
 */
// Update task status
router.put('/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { status, title, description, priority } = req.body;

        const task = await LocalTask.findOne({ _id: req.params.taskId, userId });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        if (status) {
            task.status = status;
            if (status === 'completed') {
                task.completedAt = new Date();
            }
        }
        if (title) task.title = title;
        if (description !== undefined) task.description = description;
        if (priority) task.priority = priority;

        await task.save();

        res.json({
            success: true,
            message: 'Task updated successfully',
            task
        });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ success: false, message: 'Error updating task' });
    }
});

// ============ PROJECT-SPECIFIC ROUTES ============

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     Summary: Get a single local project
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 */
// Get single project
router.get('/:projectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const project = await LocalProject.findOne({ _id: req.params.projectId, userId });

        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        // Get project tasks
        const tasks = await LocalTask.find({ projectId: project._id, userId }).sort({ createdAt: -1 });

        res.json({
            success: true,
            project,
            tasks: tasks.map(t => ({
                id: t._id,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                taskType: t.taskType,
                dueDate: t.dueDate,
                createdAt: t.createdAt,
                completedAt: t.completedAt
            }))
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ success: false, message: 'Error fetching project' });
    }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update a local project
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               priority:
 *                 type: string
 *               progress:
 *                 type: number
 *               tags:
 *                 type: array
 *     responses:
 *       200:
 *         description: Project updated successfully
 */
// Update project
router.put('/:projectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { name, description, status, priority, progress, tags, workspaceId, 
                isGitEnabled, pushedToGitHub, githubRepoUrl, githubRepoName } = req.body;

        const project = await LocalProject.findOne({ _id: req.params.projectId, userId });
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (status) project.status = status;
        if (priority) project.priority = priority;
        if (progress !== undefined) project.progress = progress;
        if (tags) project.tags = tags;
        if (workspaceId) project.workspaceId = workspaceId;
        if (isGitEnabled !== undefined) project.isGitEnabled = isGitEnabled;
        if (pushedToGitHub !== undefined) project.pushedToGitHub = pushedToGitHub;
        if (githubRepoUrl) project.githubRepoUrl = githubRepoUrl;
        if (githubRepoName) project.githubRepoName = githubRepoName;

        await project.save();

        res.json({
            success: true,
            message: 'Project updated successfully',
            project
        });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ success: false, message: 'Error updating project' });
    }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   delete:
 *     Summary: Delete/archive a local project
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project archived successfully
 */
// Archive project (soft delete)
router.delete('/:projectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const project = await LocalProject.findOne({ _id: req.params.projectId, userId });

        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        project.isArchived = true;
        await project.save();

        res.json({
            success: true,
            message: 'Project archived successfully'
        });
    } catch (error) {
        console.error('Archive project error:', error);
        res.status(500).json({ success: false, message: 'Error archiving project' });
    }
});

/**
 * @swagger
 * /api/projects/{projectId}/tasks:
 *   post:
 *     Summary: Create a task in a project (local or GitHub issue)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *               taskType:
 *                 type: string
 *                 enum: [local, github]
 *               dueDate:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 */
// Create task in project
router.post('/:projectId/tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { title, description, priority, taskType, dueDate } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        // Verify project ownership
        const project = await LocalProject.findOne({ _id: req.params.projectId, userId });
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const task = await LocalTask.create({
            userId,
            projectId: project._id,
            title,
            description: description || '',
            priority: priority || 'medium',
            taskType: taskType || 'local',
            dueDate: dueDate ? new Date(dueDate) : null,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            task
        });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: 'Error creating task' });
    }
});

/**
 * @swagger
 * /api/projects/{projectId}/tasks:
 *   get:
 *     Summary: Get tasks for a project
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of project tasks
 */
// Get project tasks
router.get('/:projectId/tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const tasks = await LocalTask.find({ 
            userId, 
            projectId: req.params.projectId 
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            tasks: tasks.map(t => ({
                id: t._id,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                taskType: t.taskType,
                dueDate: t.dueDate,
                labels: t.labels,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get project tasks error:', error);
        res.status(500).json({ success: false, message: 'Error fetching tasks' });
    }
});

module.exports = router;