const express = require('express');
const router = express.Router();
const Invitation = require('../models/Invitation');
const Company = require('../models/Company');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { sendInvitationEmail } = require('../utils/emailService');

// Create invitation
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { email, companyId, role, message } = req.body;
        
        // Check if user has permission
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        
        const member = company.members.find(m => m.user.toString() === req.userId);
        if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }
        
        // Check if already invited
        const existing = await Invitation.findOne({
            email,
            company: companyId,
            status: 'pending'
        });
        
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'User already invited'
            });
        }
        
        // Check if already a member
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            const isMember = company.members.some(m => m.user.toString() === existingUser._id.toString());
            if (isMember) {
                return res.status(400).json({
                    success: false,
                    message: 'User is already a member'
                });
            }
        }
        
        const invitation = await Invitation.create({
            email,
            company: companyId,
            invitedBy: req.userId,
            role: role || 'member',
            message
        });
        
        await invitation.populate('invitedBy', 'fullName email');
        await invitation.populate('company', 'name description');
        
        // Send email
        try {
            await sendInvitationEmail(invitation);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
        }
        
        res.json({
            success: true,
            invitation
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all invitations for a company
router.get('/company/:companyId', authenticateToken, async (req, res) => {
    try {
        const invitations = await Invitation.find({
            company: req.params.companyId
        })
            .populate('invitedBy', 'fullName email profilePicture')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            invitations
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get invitations for current user
router.get('/my-invitations', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        
        const invitations = await Invitation.find({
            email: user.email,
            status: 'pending'
        })
            .populate('company', 'name description logo')
            .populate('invitedBy', 'fullName email profilePicture')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            invitations
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Accept invitation
router.post('/:token/accept', authenticateToken, async (req, res) => {
    try {
        const invitation = await Invitation.findOne({ token: req.params.token });
        
        if (!invitation) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }
        
        if (invitation.isExpired()) {
            return res.status(400).json({ success: false, message: 'Invitation expired' });
        }
        
        if (invitation.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Invitation already processed' });
        }
        
        const user = await User.findById(req.userId);
        if (user.email !== invitation.email) {
            return res.status(403).json({ success: false, message: 'This invitation is for a different email' });
        }
        
        // Add user to company
        const company = await Company.findById(invitation.company);
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        
        if (!isMember) {
            company.members.push({
                user: req.userId,
                role: invitation.role
            });
            await company.save();
        }
        
        invitation.status = 'accepted';
        invitation.acceptedAt = new Date();
        invitation.acceptedBy = req.userId;
        await invitation.save();
        
        res.json({
            success: true,
            message: 'Invitation accepted',
            company
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Decline invitation
router.post('/:token/decline', authenticateToken, async (req, res) => {
    try {
        const invitation = await Invitation.findOne({ token: req.params.token });
        
        if (!invitation) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }
        
        invitation.status = 'declined';
        await invitation.save();
        
        res.json({
            success: true,
            message: 'Invitation declined'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Resend invitation
router.post('/:id/resend', authenticateToken, async (req, res) => {
    try {
        const invitation = await Invitation.findById(req.params.id);
        
        if (!invitation) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }
        
        if (invitation.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Can only resend pending invitations' });
        }
        
        invitation.metadata.sentCount += 1;
        invitation.metadata.lastSentAt = new Date();
        await invitation.save();
        
        await invitation.populate('invitedBy', 'fullName email');
        await invitation.populate('company', 'name description');
        
        // Send email
        try {
            await sendInvitationEmail(invitation);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
        }
        
        res.json({
            success: true,
            message: 'Invitation resent',
            invitation
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cancel invitation
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const invitation = await Invitation.findByIdAndDelete(req.params.id);
        
        if (!invitation) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }
        
        res.json({
            success: true,
            message: 'Invitation cancelled'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
