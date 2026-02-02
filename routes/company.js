const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const User = require('../models/User');
const TeamActivity = require('../models/TeamActivity');
const Subscription = require('../models/Subscription');

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

// Create company
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Company name is required'
            });
        }
        
        // Check user's subscription
        const subscription = await Subscription.findOne({ user: req.userId });
        const tier = subscription?.tier || 'freebie';
        
        // Check if user already owns a company
        const existingCompany = await Company.findOne({ owner: req.userId });
        
        // Tier-based restrictions
        if (tier === 'freebie' && existingCompany) {
            return res.status(403).json({
                success: false,
                message: 'Freebie tier allows only one company. Upgrade to Professional for more workspaces.'
            });
        }
        
        if (tier === 'professional' && existingCompany) {
            return res.status(403).json({
                success: false,
                message: 'Professional tier allows only one company. Upgrade to Enterprise for multiple workspaces.'
            });
        }
        
        // Generate slug
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        
        // Check if slug exists
        const existingSlug = await Company.findOne({ slug });
        if (existingSlug) {
            return res.status(400).json({
                success: false,
                message: 'Company name already taken. Please choose another.'
            });
        }
        
        // Set member limit based on tier
        const memberLimit = tier === 'freebie' ? 3 : tier === 'professional' ? 10 : 999999;
        
        const company = new Company({
            name,
            slug,
            description,
            owner: req.userId,
            members: [{
                user: req.userId,
                role: 'owner',
                joinedAt: new Date()
            }],
            subscription: {
                tier,
                memberLimit
            }
        });
        
        await company.save();
        
        // Log activity
        await TeamActivity.create({
            company: company._id,
            user: req.userId,
            type: 'project_created',
            action: `Created company workspace: ${name}`
        });
        
        res.json({
            success: true,
            message: 'Company created successfully',
            company: {
                id: company._id,
                name: company.name,
                slug: company.slug,
                description: company.description
            }
        });
    } catch (error) {
        console.error('Create company error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create company'
        });
    }
});

// Get user's companies
router.get('/my-companies', authenticateToken, async (req, res) => {
    try {
        const companies = await Company.find({
            $or: [
                { owner: req.userId },
                { 'members.user': req.userId }
            ],
            isActive: true
        })
        .populate('owner', 'fullName email profilePicture')
        .populate('members.user', 'fullName email profilePicture')
        .sort({ createdAt: -1 });
        
        const companiesData = companies.map(company => {
            const userMember = company.members.find(m => m.user._id.toString() === req.userId);
            return {
                id: company._id,
                name: company.name,
                slug: company.slug,
                description: company.description,
                logo: company.logo,
                owner: company.owner,
                memberCount: company.members.length,
                memberLimit: company.subscription.memberLimit,
                tier: company.subscription.tier,
                userRole: userMember?.role || 'member',
                stats: company.stats,
                createdAt: company.createdAt
            };
        });
        
        res.json({
            success: true,
            companies: companiesData
        });
    } catch (error) {
        console.error('Get companies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch companies'
        });
    }
});

// Get company details
router.get('/:companyId', authenticateToken, async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId)
            .populate('owner', 'fullName email profilePicture')
            .populate('members.user', 'fullName email profilePicture role')
            .populate('members.invitedBy', 'fullName');
        
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        
        // Check if user is a member
        const isMember = company.members.some(m => m.user._id.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this company'
            });
        }
        
        res.json({
            success: true,
            company: {
                id: company._id,
                name: company.name,
                slug: company.slug,
                description: company.description,
                logo: company.logo,
                owner: company.owner,
                members: company.members,
                settings: company.settings,
                subscription: company.subscription,
                stats: company.stats,
                createdAt: company.createdAt
            }
        });
    } catch (error) {
        console.error('Get company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company'
        });
    }
});

// Get company members
router.get('/:companyId/members', authenticateToken, async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId)
            .populate('members.user', 'fullName email profilePicture role');
        
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        
        // Check if user is a member
        const isMember = company.members.some(m => m.user._id.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this company'
            });
        }
        
        res.json({
            success: true,
            members: company.members
        });
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members'
        });
    }
});

// Invite member
router.post('/:companyId/invite', authenticateToken, async (req, res) => {
    try {
        const { email, role = 'member' } = req.body;
        
        const company = await Company.findById(req.params.companyId);
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        
        // Check if user has permission to invite
        const userMember = company.members.find(m => m.user.toString() === req.userId);
        if (!userMember || !['owner', 'admin'].includes(userMember.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to invite members'
            });
        }
        
        // Check member limit
        if (company.members.length >= company.subscription.memberLimit) {
            return res.status(403).json({
                success: false,
                message: `Member limit reached (${company.subscription.memberLimit}). Upgrade your plan to add more members.`
            });
        }
        
        // Find user by email
        const invitedUser = await User.findOne({ email });
        if (!invitedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found with this email'
            });
        }
        
        // Check if already a member
        const alreadyMember = company.members.some(m => m.user.toString() === invitedUser._id.toString());
        if (alreadyMember) {
            return res.status(400).json({
                success: false,
                message: 'User is already a member'
            });
        }
        
        // Add member
        company.members.push({
            user: invitedUser._id,
            role,
            joinedAt: new Date(),
            invitedBy: req.userId
        });
        
        await company.save();
        
        // Log activity
        await TeamActivity.create({
            company: company._id,
            user: req.userId,
            type: 'member_joined',
            action: `Invited ${invitedUser.fullName} to the team`,
            metadata: { targetUser: invitedUser._id }
        });
        
        res.json({
            success: true,
            message: 'Member invited successfully'
        });
    } catch (error) {
        console.error('Invite member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to invite member'
        });
    }
});

// Remove member
router.delete('/:companyId/members/:userId', authenticateToken, async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId);
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        
        // Check if user has permission
        const userMember = company.members.find(m => m.user.toString() === req.userId);
        if (!userMember || !['owner', 'admin'].includes(userMember.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to remove members'
            });
        }
        
        // Cannot remove owner
        if (company.owner.toString() === req.params.userId) {
            return res.status(403).json({
                success: false,
                message: 'Cannot remove company owner'
            });
        }
        
        company.members = company.members.filter(m => m.user.toString() !== req.params.userId);
        await company.save();
        
        // Log activity
        await TeamActivity.create({
            company: company._id,
            user: req.userId,
            type: 'member_left',
            action: `Removed a member from the team`,
            metadata: { targetUser: req.params.userId }
        });
        
        res.json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove member'
        });
    }
});

// Update company
router.put('/:companyId', authenticateToken, async (req, res) => {
    try {
        const { name, description, logo } = req.body;
        
        const company = await Company.findById(req.params.companyId);
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        
        // Check if user is owner or admin
        const userMember = company.members.find(m => m.user.toString() === req.userId);
        if (!userMember || !['owner', 'admin'].includes(userMember.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update company'
            });
        }
        
        if (name) company.name = name;
        if (description !== undefined) company.description = description;
        if (logo !== undefined) company.logo = logo;
        
        await company.save();
        
        res.json({
            success: true,
            message: 'Company updated successfully',
            company: {
                id: company._id,
                name: company.name,
                description: company.description,
                logo: company.logo
            }
        });
    } catch (error) {
        console.error('Update company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update company'
        });
    }
});

module.exports = router;
