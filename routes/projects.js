const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { enforceProjectLimit } = require('../middleware/trial');
const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');
const CodeFile = require('../models/CodeFile');
const { resolveAccessibleSpecs, getAccessibleProjects, userCanAccessProject } = require('../utils/specAccess');
const { normalizeMembers } = require('../utils/members');
const { assertCompanyMembership } = require('../middleware/workspaceAccess');
const { ensurePersonalWorkspace } = require('../utils/personalWorkspace');
const { getGitHubIntegration } = require('../utils/githubApiClient');
const {
    TEMPLATE_FILES,
    provisionProject,
    retryProvisioning,
    normalizeRepoName,
    normalizeBranch
} = require('../utils/projectProvisioningService');

function provisioningPayload(project) {
    return {
        id: project._id,
        name: project.name,
        sourceType: project.sourceType,
        githubRepoName: project.githubRepoName,
        githubRepoUrl: project.githubRepoUrl,
        defaultBranch: project.defaultBranch,
        provisioningStatus: project.provisioningStatus,
        provisioningError: project.provisioningError,
        provisionedAt: project.provisionedAt,
        provisionedFileCount: project.provisionedFileCount
    };
}

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
        const projects = await getAccessibleProjects(userId);

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
                githubRepoName: p.githubRepoName,
                visibility: p.visibility,
                sourceType: p.sourceType,
                defaultBranch: p.defaultBranch,
                template: p.template,
                provisioningStatus: p.provisioningStatus,
                provisioningError: p.provisioningError,
                provisionedAt: p.provisionedAt,
                provisionedFileCount: p.provisionedFileCount,
                technologies: p.technologies,
                intelligence: p.intelligence,
                workspaceId: p.workspaceId,
                members: normalizeMembers(p.members),
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
 *               visibility:
 *                 type: string
 *                 enum: [private, public]
 *               sourceType:
 *                 type: string
 *                 enum: [scratch, github, template]
 *               githubRepoUrl:
 *                 type: string
 *               defaultBranch:
 *                 type: string
 *               template:
 *                 type: string
 *               technologies:
 *                 type: array
 *                 items:
 *                   type: string
 *               intelligence:
 *                 type: object
 *                 properties:
 *                   figma:
 *                     type: boolean
 *                   starterSpec:
 *                     type: boolean
 *                   aiAgents:
 *                     type: boolean
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
        const {
            name, description, priority, tags, visibility = 'private',
            sourceType = 'scratch', githubRepoUrl, githubRepoName, defaultBranch = 'main',
            template = '', technologies = [], intelligence = {}
        } = req.body;

        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Project name is required' });
        }

        if (!['private', 'public'].includes(visibility)) {
            return res.status(400).json({ success: false, message: 'Visibility must be private or public' });
        }
        if (!['scratch', 'github', 'template'].includes(sourceType)) {
            return res.status(400).json({ success: false, message: 'Source type must be scratch, github, or template' });
        }
        if (typeof description !== 'undefined' && typeof description !== 'string') {
            return res.status(400).json({ success: false, message: 'Description must be a string' });
        }
        if (typeof defaultBranch !== 'string' || typeof template !== 'string') {
            return res.status(400).json({ success: false, message: 'Branch and template must be strings' });
        }
        if (!Array.isArray(technologies) || technologies.some((technology) => typeof technology !== 'string')) {
            return res.status(400).json({ success: false, message: 'Technologies must be an array of strings' });
        }
        if (typeof tags !== 'undefined' && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
            return res.status(400).json({ success: false, message: 'Tags must be an array of strings' });
        }
        if (!intelligence || typeof intelligence !== 'object' || Array.isArray(intelligence)) {
            return res.status(400).json({ success: false, message: 'Intelligence settings must be an object' });
        }
        const intelligenceSettings = {};
        for (const setting of ['figma', 'starterSpec', 'aiAgents']) {
            if (typeof intelligence[setting] !== 'undefined' && typeof intelligence[setting] !== 'boolean') {
                return res.status(400).json({ success: false, message: `${setting} must be a boolean` });
            }
            if (typeof intelligence[setting] !== 'undefined') {
                intelligenceSettings[setting] = intelligence[setting];
            }
        }

        let repositoryUrl;
        let repositoryName;
        let branch;
        if (sourceType === 'github') {
            try {
                const repository = normalizeRepoName(githubRepoName || githubRepoUrl);
                repositoryName = repository.fullName;
                repositoryUrl = repository.url;
                branch = normalizeBranch(defaultBranch || 'main');
                await getGitHubIntegration(userId);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: error.code === 'GITHUB_NOT_CONNECTED'
                        ? 'Connect GitHub before importing a repository.'
                        : 'A valid GitHub repository and branch are required when using a GitHub source'
                });
            }
        } else {
            try {
                branch = normalizeBranch(defaultBranch || 'main');
            } catch {
                return res.status(400).json({ success: false, message: 'A valid branch name is required' });
            }
        }

        if (sourceType === 'template' && !TEMPLATE_FILES[String(template).trim()]) {
            return res.status(400).json({ success: false, message: 'Choose a supported project template' });
        }

        // Personal projects only. Team-scoped projects are created from the
        // teams page by product admins, not from this endpoint.
        const workspace = await ensurePersonalWorkspace(userId);
        const projectWorkspaceId = workspace._id;

        const project = await LocalProject.create({
            userId,
            workspaceId: projectWorkspaceId,
            name: name.trim(),
            description: (description || '').trim(),
            priority: priority || 'medium',
            tags: tags || [],
            status: 'active',
            visibility,
            sourceType,
            githubRepoUrl: repositoryUrl,
            githubRepoName: repositoryName,
            defaultBranch: branch,
            template: template.trim(),
            provisioningStatus: 'pending',
            technologies: [...new Set(technologies.map((technology) => technology.trim()).filter(Boolean))],
            intelligence: intelligenceSettings
        });

        if (sourceType === 'github') {
            provisionProject(project._id, userId).catch((error) => {
                console.error('Project provisioning kickoff failed:', project._id, error?.message || error);
            });

            return res.status(201).json({
                success: true,
                message: 'Project created; repository import started',
                project
            });
        }

        const provisionedProject = await provisionProject(project._id, userId);
        const provisioningFailed = provisionedProject?.provisioningStatus === 'failed';

        res.status(201).json({
            success: true,
            message: provisioningFailed
                ? (provisionedProject.provisioningError || 'Project created; setup needs a retry')
                : 'Project created successfully',
            project: provisionedProject || project
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ success: false, message: 'Error creating project' });
    }
});

// ============ STANDALONE TASKS (must come before /:projectId routes) ============

// Shared serializer so GET /tasks and GET /tasks/:taskId return identical task shapes
const serializeTask = (t) => ({
    id: t._id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    projectId: t.projectId,
    companyId: t.companyId,
    specIds: t.specIds,
    figmaNodeId: t.figmaNodeId,
    blockedBy: t.blockedBy,
    branch: t.branch,
    pullRequestId: t.pullRequestId,
    agentSessionId: t.agentSessionId,
    agentExecution: t.agentExecution,
    dueDate: t.dueDate,
    labels: t.labels,
    assignee: t.assignee,
    assigneeName: t.assigneeName,
    githubIssueUrl: t.githubIssueUrl,
    githubIssueNumber: t.githubIssueNumber,
    githubRepoName: t.githubRepoName,
    isPushedToGit: t.isPushedToGit,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
});

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
        }).populate('assignee', 'fullName name').sort({ createdAt: -1 });

        res.json({
            success: true,
            tasks: tasks.map(serializeTask)
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
 *               status:
 *                 type: string
 *                 enum: [backlog, in_progress, in_review, blocked, done]
 *               assignToMe:
 *                 type: boolean
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 */
// Create standalone task
router.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const {
            title, description, priority, taskType, dueDate, projectId,
            specIds = [], figmaNodeId, blockedBy = [], status = 'backlog',
            assignToMe = false, labels = [],
        } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        if (!['critical', 'high', 'medium', 'low', 'urgent'].includes(priority || 'medium')) {
            return res.status(400).json({ success: false, message: 'Invalid task priority' });
        }
        if (!['backlog', 'in_progress', 'in_review', 'blocked', 'done'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid task status' });
        }
        if (typeof assignToMe !== 'boolean') {
            return res.status(400).json({ success: false, message: 'assignToMe must be a boolean' });
        }
        if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string' || !label.trim())) {
            return res.status(400).json({ success: false, message: 'Labels must be an array of non-empty strings' });
        }

        if (specIds.length) {
            const resolved = await resolveAccessibleSpecs(specIds, { projectId, userId });
            if (!resolved.ok) {
                return res.status(400).json({ success: false, message: resolved.message });
            }
        }

        // Personal tasks only. Team-scoped tasks are created from the teams
        // page by product admins, not from this endpoint.
        const workspace = await ensurePersonalWorkspace(userId);
        const resolvedCompanyId = workspace._id;

        if (projectId) {
            const project = await LocalProject.findById(projectId).select('workspaceId').lean();
            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found' });
            }
            if (!(await userCanAccessProject(projectId, userId))) {
                return res.status(403).json({ success: false, message: 'Project access denied' });
            }
        }

        const task = await LocalTask.create({
            userId,
            title,
            description: description || '',
            priority: priority || 'medium',
            taskType: ['github', 'gitlab'].includes(taskType) ? taskType : 'local',
            dueDate: dueDate ? new Date(dueDate) : null,
            projectId: projectId || null,
            companyId: resolvedCompanyId,
            specIds,
            figmaNodeId: figmaNodeId || null,
            blockedBy,
            status,
            completedAt: status === 'done' ? new Date() : null,
            assignee: assignToMe ? userId : null,
            assigneeName: assignToMe ? (req.user.fullName || req.user.name || '') : '',
            labels: [...new Set(labels.map((label) => label.trim()).filter(Boolean))],
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
 *   get:
 *     summary: Get a single task by ID
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
 *     responses:
 *       200:
 *         description: Task found
 *       404:
 *         description: Task not found
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
// Get single task by ID
router.get('/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { taskId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        const task = await LocalTask.findOne({ _id: taskId, userId });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        res.json({
            success: true,
            task: serializeTask(task)
        });
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ success: false, message: 'Error fetching task' });
    }
});

// Update task status
router.put('/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { status, title, description, priority, specIds, figmaNodeId, blockedBy } = req.body;

        const task = await LocalTask.findOne({ _id: req.params.taskId, userId });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        if (status) {
            if (!['backlog', 'in_progress', 'in_review', 'blocked', 'done', 'pending', 'in-progress', 'completed'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid task status' });
            }
            task.status = status;
            if (status === 'completed' || status === 'done') {
                task.completedAt = new Date();
            }
        }
        if (title) task.title = title;
        if (description !== undefined) task.description = description;
        if (priority) {
            if (!['critical', 'high', 'medium', 'low', 'urgent'].includes(priority)) {
                return res.status(400).json({ success: false, message: 'Invalid task priority' });
            }
            task.priority = priority;
        }
        if (specIds !== undefined) {
            const resolved = await resolveAccessibleSpecs(specIds, { projectId: task.projectId || null, userId });
            if (!resolved.ok) {
                return res.status(400).json({ success: false, message: resolved.message });
            }
            task.specIds = specIds;
        }
        if (figmaNodeId !== undefined) task.figmaNodeId = figmaNodeId || null;
        if (blockedBy !== undefined) {
            const blockers = await LocalTask.find({ _id: { $in: blockedBy }, userId });
            if (blockers.length !== new Set(blockedBy.map(String)).size) {
                return res.status(400).json({ success: false, message: 'One or more blocking tasks were not found' });
            }
            task.blockedBy = blockedBy;
        }

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

router.get('/:projectId/provisioning', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const project = await LocalProject.findById(req.params.projectId);

        if (!project || !await userCanAccessProject(project._id, userId)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        res.json({
            success: true,
            project: provisioningPayload(project)
        });
    } catch (error) {
        console.error('Get project provisioning error:', error);
        res.status(500).json({ success: false, message: 'Error fetching project setup status' });
    }
});

router.post('/:projectId/provisioning/retry', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const project = await LocalProject.findById(req.params.projectId);

        if (!project || !await userCanAccessProject(project._id, userId)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        if (project.provisioningStatus === 'ready') {
            return res.json({
                success: true,
                message: 'Project setup is already complete',
                project: provisioningPayload(project)
            });
        }
        if (project.provisioningStatus === 'provisioning') {
            return res.status(409).json({
                success: false,
                message: 'Project setup is already running',
                project: provisioningPayload(project)
            });
        }

        if (project.sourceType === 'github') {
            try {
                await getGitHubIntegration(userId);
            } catch {
                return res.status(400).json({
                    success: false,
                    message: 'Connect GitHub before importing a repository'
                });
            }

            retryProvisioning(project._id, userId).catch((error) => {
                console.error('Project provisioning retry failed:', project._id, error?.message || error);
            });

            const pending = await LocalProject.findById(project._id);
            return res.status(202).json({
                success: true,
                message: 'Project setup retry started',
                project: provisioningPayload(pending)
            });
        }

        const updated = await retryProvisioning(project._id, userId);
        const updatedStatus = updated?.provisioningStatus;
        res.json({
            success: true,
            message: updatedStatus === 'failed'
                ? (updated.provisioningError || 'Project setup failed')
                : updatedStatus === 'ready'
                    ? 'Project setup completed'
                    : 'Project setup is already running',
            project: provisioningPayload(updated || project)
        });
    } catch (error) {
        console.error('Retry project provisioning error:', error);
        res.status(500).json({ success: false, message: 'Error retrying project setup' });
    }
});

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
        const project = await LocalProject.findById(req.params.projectId);

        if (!project || !await userCanAccessProject(project._id, userId)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const tasks = await LocalTask.find({ projectId: project._id }).sort({ createdAt: -1 });

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

        // A project may only be attached to a workspace the caller belongs to;
        // otherwise it becomes a handle for deploying another tenant's files.
        if (workspaceId && !(await assertCompanyMembership(workspaceId, userId, res))) return;

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
            status: 'pending',
            companyId: project.workspaceId ? String(project.workspaceId) : null
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

/**
 * @swagger
 * /api/projects/{projectId}/files:
 *   get:
 *     summary: Get all code files for a project
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
 *         description: List of files in the project
 *       404:
 *         description: Project not found
 */
// Get files for a project (from VFS / CodeFile collection)
router.get('/:projectId/files', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const { projectId } = req.params;

        // Verify project ownership
        const project = await LocalProject.findOne({ _id: projectId, userId });
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        // Strict project scoping. The old fallback (`{ company: workspaceId }`
        // when the project had a workspace) returned EVERY file of the whole
        // workspace, so one project's explorer showed another project's files.
        // Files created from the editor carry `project`, so scope by it.
        const query = { project: projectId };

        const files = await CodeFile.find(query)
            .select('name path language size updatedAt createdAt')
            .sort({ path: 1, name: 1 })
            .lean();

        res.json({
            success: true,
            files,
            project: {
                id: project._id,
                name: project.name,
                description: project.description
            }
        });
    } catch (error) {
        console.error('Get project files error:', error);
        res.status(500).json({ success: false, message: 'Error fetching project files' });
    }
});

module.exports = router;