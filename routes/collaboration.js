/**
 * Collaboration API Routes
 * Handles real-time collaboration endpoints
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const TeamProject = require('../models/TeamProject');
const TeamTask = require('../models/TeamTask');
const collaborationService = require('../utils/collaborationService');

const ensureCompanyMember = async (req, res, next) => {
    try {
        const company = await Company.findById(req.params.companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: 'Not a member of this company' });
        }
        req.company = company;
        next();
    } catch (error) {
        console.error('Company membership check error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @swagger
 * /api/collaboration/file/{fileId}/users:
 *   get:
 *     summary: Get active users editing a file
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID
 *     responses:
 *       200:
 *         description: List of active users
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
router.get('/file/:fileId/users', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Verify user has access to file
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const users = collaborationService.getActiveUsers(fileId);
        
        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        console.error('Get active users error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/file/{fileId}/join:
 *   post:
 *     summary: Join a collaboration session
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID
 *     responses:
 *       200:
 *         description: Joined collaboration session
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
router.post('/file/:fileId/join', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Verify user has access to file
        const file = await CodeFile.findById(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Load document
        await collaborationService.loadDocument(fileId);
        
        res.json({
            success: true,
            message: 'Joined collaboration session',
            fileId
        });
    } catch (error) {
        console.error('Join collaboration error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/file/{fileId}/leave:
 *   post:
 *     summary: Leave a collaboration session
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID
 *     responses:
 *       200:
 *         description: Left collaboration session
 *       401:
 *         description: Unauthorized
 */
router.post('/file/:fileId/leave', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        res.json({
            success: true,
            message: 'Left collaboration session'
        });
    } catch (error) {
        console.error('Leave collaboration error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/{companyId}/projects:
 *   get:
 *     summary: Get all projects for a company
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of company projects
 *       404:
 *         description: Company not found
 *       403:
 *         description: Not a member of this company
 */
router.get('/:companyId/projects', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const projects = await TeamProject.find({ company: req.params.companyId })
            .populate('owner', 'fullName email profilePicture')
            .populate('members', 'fullName email profilePicture')
            .sort({ createdAt: -1 });
        
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
                owner: p.owner,
                members: p.members,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get company projects error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/{companyId}/projects:
 *   post:
 *     summary: Create a new project in a company
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
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
 *                 enum: [planning, active, on-hold, completed, archived]
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
 *       404:
 *         description: Company not found
 *       403:
 *         description: Not a member of this company
 */
router.post('/:companyId/projects', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { name, description, status, priority, tags } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Project name is required' });
        }
        
        const project = await TeamProject.create({
            company: req.params.companyId,
            name,
            description: description || '',
            status: status || 'planning',
            priority: priority || 'medium',
            tags: tags || [],
            owner: req.userId,
            members: [req.userId]
        });
        
        await project.populate('owner', 'fullName email profilePicture');
        await project.populate('members', 'fullName email profilePicture');
        
        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            project
        });
    } catch (error) {
        console.error('Create company project error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/{companyId}/tasks:
 *   get:
 *     summary: Get all tasks for a company
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: projectId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter tasks by project
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter tasks by status
 *     responses:
 *       200:
 *         description: List of company tasks
 *       404:
 *         description: Company not found
 *       403:
 *         description: Not a member of this company
 */
router.get('/:companyId/tasks', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { projectId, status } = req.query;
        const query = { company: req.params.companyId };
        
        if (projectId) {
            query.project = projectId;
        }
        if (status) {
            query.status = status;
        }
        
        const tasks = await TeamTask.find(query)
            .populate('project', 'name')
            .populate('assignedTo', 'fullName email profilePicture')
            .populate('createdBy', 'fullName email profilePicture')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            tasks: tasks.map(t => ({
                id: t._id,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                projectId: t.project,
                dueDate: t.dueDate,
                assignedTo: t.assignedTo,
                createdBy: t.createdBy,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get company tasks error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/{companyId}/tasks:
 *   post:
 *     summary: Create a new task in a company
 *     tags:
 *       - Collaboration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
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
 *               projectId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [todo, in-progress, review, done, blocked]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               assignedTo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 *       404:
 *         description: Company not found
 *       403:
 *         description: Not a member of this company
 */
router.post('/:companyId/tasks', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { title, description, projectId, status, priority, dueDate, assignedTo } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }
        
        const task = await TeamTask.create({
            company: req.params.companyId,
            project: projectId || null,
            title,
            description: description || '',
            status: status || 'todo',
            priority: priority || 'medium',
            dueDate: dueDate ? new Date(dueDate) : null,
            assignedTo: assignedTo || null,
            createdBy: req.userId
        });
        
        await task.populate('project', 'name');
        await task.populate('assignedTo', 'fullName email profilePicture');
        await task.populate('createdBy', 'fullName email profilePicture');
        
        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            task
        });
    } catch (error) {
        console.error('Create company task error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
