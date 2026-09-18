const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const Company = require('../models/Company');

const ensureCompanyMember = async (req, res, next) => {
    try {
        const companyId = req.params.companyId || req.query.companyId || req.body.companyId;
        const company = await Company.findById(companyId);
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
        res.status(500).json({ success: false, message: error.message });
    }
};

router.get('/company/:companyId', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { category, event, limit = 100, skip = 0 } = req.query;
        const filter = { company: req.params.companyId };
        if (category) filter.category = category;
        if (event) filter.event = event;

        const logs = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(parseInt(skip) || 0)
            .limit(Math.min(parseInt(limit) || 100, 500))
            .populate('actor', 'fullName email profilePicture');

        const total = await AuditLog.countDocuments(filter);

        res.json({
            success: true,
            logs,
            total,
            limit: parseInt(limit) || 100,
            skip: parseInt(skip) || 0
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const companyId = req.query.companyId;
        if (!companyId) return res.json({ success: true, categories: [] });
        const categories = await AuditLog.distinct('category', { company: companyId });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;