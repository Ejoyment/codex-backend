const express = require('express');
const router = express.Router();
const Standup = require('../models/Standup');
const Company = require('../models/Company');
const LocalTask = require('../models/LocalTask');
const Meeting = require('../models/MeetingRoom');
const { authenticateToken } = require('../middleware/auth');

const DAY = 24 * 60 * 60 * 1000;

// Auto-generate a draft standup from the user's recent activity
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.body;
        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }

        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: 'Not a member of this company' });
        }

        const since = new Date(Date.now() - DAY);

        // 1. Tasks touched in the last 24h (owned by the user or assigned)
        const tasks = await LocalTask.find({
            userId: req.userId,
            updatedAt: { $gte: since }
        }).sort({ updatedAt: -1 }).limit(15);

        // 2. Meetings the user created or participates in
        const meetings = await Meeting.find({
            company: companyId,
            $or: [
                { host: req.userId, updatedAt: { $gte: since } },
                { 'participants.user': req.userId }
            ],
            scheduledAt: { $gte: since }
        }).sort({ scheduledAt: -1 }).limit(10);

        // 3. Prior standups
        const prior = await Standup.find({ company: companyId })
            .sort({ createdAt: -1 }).limit(5).select('yesterday today blockers createdAt');

        const taskLines = tasks.length
            ? tasks.map(t => `- [${t.status || 'todo'}] ${t.title}${t.priority ? ` (${t.priority})` : ''}`).join('\n')
            : 'No task updates in the last 24 hours.';

        const meetingLines = meetings.length
            ? meetings.map(m => `- ${m.title || m.name || 'Meeting'} @ ${new Date(m.scheduledAt).toLocaleString()}`).join('\n')
            : 'No recent meetings.';

        const priorBlock = prior.length
            ? prior.map(p => `(on ${new Date(p.createdAt).toISOString().slice(0, 10)}) yesterday: ${p.yesterday || '—'} / today: ${p.today || '—'}`).join('\n')
            : 'No prior standups yet.';

        const context = [
            'Generate a concise developer standup (3 short bullet sections) based ONLY on the data below. ',
            'Be specific and factual. Do not invent details. ',
            'Section 1 "Yesterday": summarize completed task progress from the task updates and prior standups. ',
            'Section 2 "Today": propose what to work on next based on remaining/open tasks. ',
            'Section 3 "Blockers": only include a blocker if a meeting or task context implies one; otherwise write "None".',
            '',
            'Task updates (last 24h):',
            taskLines,
            '',
            'Recent meetings:',
            meetingLines,
            '',
            'Prior standups:',
            priorBlock
        ].join('\n');

        const aiService = require('../utils/aiService');
        const result = await aiService.chat([{ role: 'user', content: context }]);

        res.json({
            success: true,
            draft: (result && result.content) || null,
            context: { tasks: taskLines, meetings: meetingLines }
        });
    } catch (error) {
        console.error('Standup generate error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit a standup
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { companyId, channelId, yesterday, today, blockers, relatedTasks } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }

        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: 'Not a member of this company' });
        }

        const standup = await Standup.create({
            user: req.userId,
            company: companyId,
            channel: channelId,
            yesterday: yesterday || '',
            today: today || '',
            blockers: blockers || '',
            relatedTasks: relatedTasks || []
        });

        await standup.populate('user', 'fullName email profilePicture');

        res.status(201).json({ success: true, standup });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get standups for a company
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { companyId, limit = 50, before } = req.query;

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }

        const query = { company: companyId };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const standups = await Standup.find(query)
            .populate('user', 'fullName email profilePicture')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json({ success: true, standups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;