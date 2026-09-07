const express = require('express');
const router = express.Router();
const Standup = require('../models/Standup');
const Company = require('../models/Company');
const { authenticateToken } = require('../middleware/auth');

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