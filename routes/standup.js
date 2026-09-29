const express = require('express');
const router = express.Router();
const Standup = require('../models/Standup');
const Company = require('../models/Company');
const LocalTask = require('../models/LocalTask');
const Meeting = require('../models/MeetingRoom');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');
const { canPostToChannel } = require('../utils/channelPolicy');
const { notifyStandupPosted } = require('../utils/notificationTriggers');

const DAY = 24 * 60 * 60 * 1000;

/** Render a standup as the message body that lands in the channel. */
function formatStandupMessage({ author, yesterday, today, blockers, taskTitles }) {
    const lines = [`**Daily standup — ${author}**`];
    if (yesterday) lines.push(`\n**Yesterday**\n${yesterday}`);
    if (today) lines.push(`\n**Today**\n${today}`);
    if (blockers) lines.push(`\n**Blockers**\n${blockers}`);
    if (taskTitles.length) lines.push(`\n**Related tasks**\n${taskTitles.map(t => `- ${t}`).join('\n')}`);
    return lines.join('\n');
}

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

        // A standup has to be anchored to the work it reports on, otherwise it
        // is a free-floating note nobody can trace back to a task.
        const taskIds = [...new Set((relatedTasks || []).map(String).filter(Boolean))];
        if (taskIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Select at least one related task'
            });
        }

        // "Post To" is a real delivery target: without a channel there is
        // nowhere to post, so fail loudly instead of saving an invisible record.
        if (!channelId) {
            return res.status(400).json({
                success: false,
                message: 'Select a channel to post the standup to'
            });
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

        const channel = await Channel.findById(String(channelId)).select('company members type name');
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Channel not found' });
        }
        if (String(channel.company) !== String(companyId)) {
            return res.status(403).json({
                success: false,
                message: 'That channel belongs to a different workspace'
            });
        }
        const post = canPostToChannel(channel, req.userId);
        if (!post.ok) {
            return res.status(403).json({ success: false, message: post.reason });
        }

        // Resolve titles up front so the channel message is useful and a bad
        // task id cannot blow up after the standup is already stored.
        const tasks = await LocalTask.find({ _id: { $in: taskIds } }).select('title status');
        if (tasks.length === 0) {
            return res.status(400).json({ success: false, message: 'None of the selected tasks could be found' });
        }
        const taskTitles = tasks.map(t => t.title).filter(Boolean);
        const author = req.user?.fullName || req.user?.name || 'A teammate';

        const standup = await Standup.create({
            user: req.userId,
            company: companyId,
            channel: channelId,
            yesterday: yesterday || '',
            today: today || '',
            blockers: blockers || '',
            relatedTasks: tasks.map(t => t._id)
        });

        await standup.populate('user', 'fullName email profilePicture');

        // Deliver to the channel. If this fails the standup record still exists,
        // so report the failure honestly rather than claiming it was posted.
        let delivered = false;
        let message = null;
        try {
            message = await Message.create({
                content: formatStandupMessage({
                    author,
                    yesterday: standup.yesterday,
                    today: standup.today,
                    blockers: standup.blockers,
                    taskTitles,
                }),
                sender: req.userId,
                channel: channelId,
                company: companyId,
                type: 'text',
            });
            await Channel.findByIdAndUpdate(channelId, {
                lastMessage: message._id,
                lastMessageAt: new Date(),
            });
            delivered = true;
        } catch (postError) {
            console.error('Standup saved but failed to post to channel:', postError);
        }

        if (delivered) {
            notifyStandupPosted({ standup, channel, author: req.user });
        }

        res.status(201).json({
            success: true,
            standup,
            channelId: String(channelId),
            channelMessage: message,
            delivered,
            ...(delivered ? {} : {
                message: 'Standup saved, but posting to the channel failed. Please post it manually.'
            })
        });
    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ success: false, message: error.message });
        }
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
            .populate('relatedTasks', 'title status')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json({ success: true, standups });
    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;