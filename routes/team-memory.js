const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const teamMemoryService = require('../utils/teamMemoryService');
const TeamConvention = require('../models/TeamConvention');
const Company = require('../models/Company');

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
 * /api/ai-context/team-conventions:
 *   post:
 *     summary: Add a team architectural convention
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [architecture, naming, error-handling, state-management, api-design, testing, security, deployment, custom]
 *               rule:
 *                 type: string
 *               description:
 *                 type: string
 *               examples:
 *                 type: array
 *                 items:
 *                   type: string
 *               techStack:
 *                 type: array
 *                 items:
 *                   type: string
 *               priority:
 *                 type: string
 *                 enum: [required, recommended, optional]
 *     responses:
 *       201:
 *         description: Convention created
 *       401:
 *         description: Unauthorized
 */
router.post('/team-conventions', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { category, rule, description, examples, techStack, priority } = req.body;
        
        if (!category || !rule) {
            return res.status(400).json({ success: false, message: 'category and rule are required' });
        }
        
        const convention = await teamMemoryService.addTeamConvention({
            companyId: req.params.companyId,
            category,
            rule,
            description: description || '',
            examples: examples || [],
            techStack: techStack || ['general'],
            priority: priority || 'recommended',
            createdBy: req.userId
        });
        
        res.status(201).json({ success: true, convention });
    } catch (error) {
        console.error('Create convention error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/team-conventions/{companyId}:
 *   get:
 *     summary: Get team conventions
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: techStack
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of conventions
 *       401:
 *         description: Unauthorized
 */
router.get('/team-conventions/:companyId', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { category, techStack } = req.query;
        const conventions = await teamMemoryService.getTeamConventions(req.params.companyId, category, techStack);
        res.json({ success: true, conventions });
    } catch (error) {
        console.error('Get conventions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/ai-context/team-conventions/{companyId}/{conventionId}:
 *   put:
 *     summary: Update a team convention
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: conventionId
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
 *     responses:
 *       200:
 *         description: Convention updated
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete a team convention
 *     tags:
 *       - AI Context Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: conventionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Convention deleted
 *       401:
 *         description: Unauthorized
 */
router.put('/team-conventions/:companyId/:conventionId', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const convention = await teamMemoryService.updateTeamConvention(req.params.conventionId, req.params.companyId, req.body);
        res.json({ success: true, convention });
    } catch (error) {
        console.error('Update convention error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/team-conventions/:companyId/:conventionId', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const convention = await teamMemoryService.deleteTeamConvention(req.params.conventionId, req.params.companyId);
        res.json({ success: true, convention });
    } catch (error) {
        console.error('Delete convention error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
