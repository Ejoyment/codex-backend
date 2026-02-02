const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const TeamProject = require('../models/TeamProject');
const TeamTask = require('../models/TeamTask');
const Meeting = require('../models/Meeting');
const TeamActivity = require('../models/TeamActivity');
const TeamChat = require('../models/TeamChat');
const { checkProjectLimit, checkTaskLimit, requireTeamFeature } = require('../middleware/teamRestrictions');

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid token' });
        }
        req.userId = decoded.id; // Store as req.userId for consistency
        next();
    });
};

// Check company membership
const checkCompanyMembership = async (req, res, next) => {
    try {
        const company = await Company.findById(req.params.companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'Not a company member' });
        }
        
        req.company = company;
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ===== PROJECTS =====

// Get all projects
router.get('/:companyId/projects', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const projects = await TeamProject.find({ company: req.params.companyId })
            .populate('owner', 'fullName email profilePicture')
            .populate('members', 'fullName email profilePicture')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, projects });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch projects' });
    }
});

// Create project
router.post('/:companyId/projects', authenticateToken, checkCompanyMembership, checkProjectLimit, async (req, res) => {
    try {
        const { name, description, priority, startDate, dueDate, members } = req.body;
        
        const project = new TeamProject({
            company: req.params.companyId,
            name,
            description,
            priority,
            startDate,
            dueDate,
            owner: req.userId,
            members: members || [req.userId]
        });
        
        await project.save();
        
        // Update company stats
        await Company.findByIdAndUpdate(req.params.companyId, {
            $inc: { 'stats.totalProjects': 1 }
        });
        
        // Log activity
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'project_created',
            action: `Created project: ${name}`,
            metadata: { projectId: project._id }
        });
        
        res.json({ success: true, message: 'Project created', project });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ success: false, message: 'Failed to create project' });
    }
});

// Update project
router.put('/:companyId/projects/:projectId', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const project = await TeamProject.findOneAndUpdate(
            { _id: req.params.projectId, company: req.params.companyId },
            req.body,
            { new: true }
        );
        
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'project_updated',
            action: `Updated project: ${project.name}`,
            metadata: { projectId: project._id }
        });
        
        res.json({ success: true, message: 'Project updated', project });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ success: false, message: 'Failed to update project' });
    }
});

// ===== TASKS =====

// Get all tasks
router.get('/:companyId/tasks', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const { projectId, status, assignedTo } = req.query;
        const filter = { company: req.params.companyId };
        
        if (projectId) filter.project = projectId;
        if (status) filter.status = status;
        if (assignedTo) filter.assignedTo = assignedTo;
        
        const tasks = await TeamTask.find(filter)
            .populate('assignedTo', 'fullName email profilePicture')
            .populate('createdBy', 'fullName email profilePicture')
            .populate('project', 'name')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
    }
});

// Create task
router.post('/:companyId/tasks', authenticateToken, checkCompanyMembership, checkTaskLimit, async (req, res) => {
    try {
        const { title, description, priority, assignedTo, dueDate, project, estimatedHours } = req.body;
        
        const task = new TeamTask({
            company: req.params.companyId,
            project,
            title,
            description,
            priority,
            assignedTo,
            dueDate,
            estimatedHours,
            createdBy: req.userId
        });
        
        await task.save();
        
        // Update company stats
        await Company.findByIdAndUpdate(req.params.companyId, {
            $inc: { 'stats.totalTasks': 1 }
        });
        
        // Log activity
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'task_created',
            action: `Created task: ${title}`,
            metadata: { taskId: task._id }
        });
        
        res.json({ success: true, message: 'Task created', task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: 'Failed to create task' });
    }
});

// Update task
router.put('/:companyId/tasks/:taskId', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const oldTask = await TeamTask.findOne({ _id: req.params.taskId, company: req.params.companyId });
        
        const task = await TeamTask.findOneAndUpdate(
            { _id: req.params.taskId, company: req.params.companyId },
            req.body,
            { new: true }
        );
        
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        
        // If task completed, update stats
        if (req.body.status === 'done' && oldTask.status !== 'done') {
            await Company.findByIdAndUpdate(req.params.companyId, {
                $inc: { 'stats.completedTasks': 1 }
            });
        }
        
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'task_updated',
            action: `Updated task: ${task.title}`,
            metadata: { taskId: task._id }
        });
        
        res.json({ success: true, message: 'Task updated', task });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ success: false, message: 'Failed to update task' });
    }
});

// Add comment to task
router.post('/:companyId/tasks/:taskId/comments', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const { text } = req.body;
        
        const task = await TeamTask.findOneAndUpdate(
            { _id: req.params.taskId, company: req.params.companyId },
            {
                $push: {
                    comments: {
                        user: req.userId,
                        text,
                        createdAt: new Date()
                    }
                }
            },
            { new: true }
        ).populate('comments.user', 'fullName profilePicture');
        
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'comment_added',
            action: `Commented on task: ${task.title}`,
            metadata: { taskId: task._id }
        });
        
        res.json({ success: true, message: 'Comment added', task });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});

// ===== MEETINGS =====

// Get all meetings
router.get('/:companyId/meetings', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const meetings = await Meeting.find({ company: req.params.companyId })
            .populate('organizer', 'fullName email profilePicture')
            .populate('participants.user', 'fullName email profilePicture')
            .sort({ scheduledAt: -1 });
        
        res.json({ success: true, meetings });
    } catch (error) {
        console.error('Get meetings error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch meetings' });
    }
});

// Schedule meeting
router.post('/:companyId/meetings', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const { title, type, description, scheduledAt, duration, participants, agenda } = req.body;
        
        const meeting = new Meeting({
            company: req.params.companyId,
            title,
            type,
            description,
            scheduledAt,
            duration,
            organizer: req.userId,
            participants: participants.map(userId => ({ user: userId, status: 'invited' })),
            agenda
        });
        
        await meeting.save();
        
        // Update company stats
        await Company.findByIdAndUpdate(req.params.companyId, {
            $inc: { 'stats.totalMeetings': 1 }
        });
        
        await TeamActivity.create({
            company: req.params.companyId,
            user: req.userId,
            type: 'meeting_scheduled',
            action: `Scheduled meeting: ${title}`,
            metadata: { meetingId: meeting._id }
        });
        
        res.json({ success: true, message: 'Meeting scheduled', meeting });
    } catch (error) {
        console.error('Schedule meeting error:', error);
        res.status(500).json({ success: false, message: 'Failed to schedule meeting' });
    }
});

// Update meeting
router.put('/:companyId/meetings/:meetingId', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const meeting = await Meeting.findOneAndUpdate(
            { _id: req.params.meetingId, company: req.params.companyId },
            req.body,
            { new: true }
        );
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        res.json({ success: true, message: 'Meeting updated', meeting });
    } catch (error) {
        console.error('Update meeting error:', error);
        res.status(500).json({ success: false, message: 'Failed to update meeting' });
    }
});

// ===== CHAT =====

// Get chat messages
router.get('/:companyId/chat', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const { channel = 'general', limit = 50 } = req.query;
        
        const messages = await TeamChat.find({
            company: req.params.companyId,
            channel,
            isDeleted: false
        })
        .populate('sender', 'fullName email profilePicture')
        .populate('mentions', 'fullName')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));
        
        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch messages' });
    }
});

// Send chat message
router.post('/:companyId/chat', authenticateToken, checkCompanyMembership, requireTeamFeature('teamChat'), async (req, res) => {
    try {
        const { message, channel = 'general', messageType = 'text', mentions, replyTo } = req.body;
        
        const chatMessage = new TeamChat({
            company: req.params.companyId,
            channel,
            sender: req.userId,
            message,
            messageType,
            mentions,
            replyTo
        });
        
        await chatMessage.save();
        await chatMessage.populate('sender', 'fullName email profilePicture');
        
        res.json({ success: true, message: 'Message sent', chatMessage });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// ===== ACTIVITY FEED =====

// Get activity feed
router.get('/:companyId/activity', authenticateToken, checkCompanyMembership, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        
        const activities = await TeamActivity.find({ company: req.params.companyId })
            .populate('user', 'fullName email profilePicture')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        res.json({ success: true, activities });
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch activity' });
    }
});

module.exports = router;
