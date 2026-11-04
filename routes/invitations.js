const { sendInternalError } = require('../utils/httpErrors');
const express = require('express');
const router = express.Router();
const Invitation = require('../models/Invitation');
const Company = require('../models/Company');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { addAuditLog } = require('../utils/auditLogService');
const invitationService = require('../utils/invitationService');
const { enqueueEmailJob } = require('../utils/emailJobWorker');

async function canManageInvitations(companyId, userId) {
    const company = await Company.findById(companyId);
    if (!company) return { company: null, allowed: false };
    const member = company.members.find((item) => item.user.toString() === String(userId));
    return {
        company,
        allowed: Boolean(member && ['owner', 'admin'].includes(member.role))
    };
}

/**
 * @swagger
 * /api/invitations:
 *   post:
 *     summary: Create and send a company invitation
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - companyId
 *             properties:
 *               email:
 *                 type: string
 *                 example: colleague@example.com
 *               companyId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *                 default: member
 *               message:
 *                 type: string
 *                 example: Join our team on CODEX!
 *     responses:
 *       200:
 *         description: Invitation created and email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 invitation:
 *                   $ref: '#/components/schemas/Invitation'
 *       400:
 *         description: User already invited or already a member
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Company not found
 */
// Create invitation
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { email, companyId, role, message } = req.body;
        
        // Check if user has permission
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        
        const member = company.members.find((item) => item.user.toString() === String(req.userId));
        if (!member || !['owner', 'admin'].includes(member.role)) {
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
        
        try {
            await enqueueEmailJob(
                'invitation',
                `invitation:${invitation._id}:${invitation.metadata.sentCount}`,
                { invitationId: invitation._id }
            );
        } catch (queueError) {
            console.error('Failed to queue invitation email:', queueError.message);
        }

        addAuditLog({
            companyId,
            actorId: req.userId,
            email: invitation.email,
            event: 'invitation.sent',
            category: 'team',
            target: `${email} (${role || 'member'})`,
            details: { invitationId: invitation._id.toString() },
            req
        });
        
        res.json({
            success: true,
            invitation
        });
    } catch (error) {
        // Lost the create race (partial unique index on pending invites).
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'User already invited' });
        }
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/company/{companyId}:
 *   get:
 *     summary: Get all invitations for a company
 *     tags:
 *       - Invitations
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
 *         description: List of invitations
 *       401:
 *         description: Unauthorized
 */
// Get all invitations for a company
router.get('/company/:companyId', authenticateToken, async (req, res) => {
    try {
        const access = await canManageInvitations(req.params.companyId, req.userId);
        if (!access.company) return res.status(404).json({ success: false, message: 'Company not found' });
        if (!access.allowed) return res.status(403).json({ success: false, message: 'Permission denied' });
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
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/my-invitations:
 *   get:
 *     summary: Get pending invitations for the current user
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending invitations
 *       401:
 *         description: Unauthorized
 */
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
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/{token}/accept:
 *   post:
 *     summary: Accept an invitation using its token
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation accepted, user added to company
 *       400:
 *         description: Invitation expired or already processed
 *       403:
 *         description: Invitation is for a different email
 *       404:
 *         description: Invitation not found
 */
// Accept invitation
router.post('/:token/accept', authenticateToken, async (req, res) => {
    try {
        const result = await invitationService.acceptInvitation(req.params.token, req.userId);
        if (!result.success) return res.status(result.status).json(result);
        const { invitation, user, company } = result;

        if (!result.alreadyAccepted) {
            addAuditLog({
                companyId: company._id,
                actorId: req.userId,
                email: user.email,
                event: 'invitation.accepted',
                category: 'team',
                target: `${user.email} added as ${invitation.role}`,
                details: { invitationId: invitation._id.toString(), role: invitation.role },
                req
            });
        }
        
        res.json({
            success: true,
            message: result.alreadyAccepted ? 'You are already a member' : 'Invitation accepted',
            company
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/{token}/decline:
 *   post:
 *     summary: Decline an invitation
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation declined
 *       404:
 *         description: Invitation not found
 */
// Decline invitation
router.post('/:token/decline', authenticateToken, async (req, res) => {
    try {
        const result = await invitationService.declineInvitation(req.params.token, req.userId);
        if (!result.success) return res.status(result.status).json(result);
        
        res.json({
            success: true,
            message: 'Invitation declined'
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/{id}/resend:
 *   post:
 *     summary: Resend an invitation email
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation resent
 *       400:
 *         description: Can only resend pending invitations
 *       404:
 *         description: Invitation not found
 */
// Resend invitation
router.post('/:id/resend', authenticateToken, async (req, res) => {
    try {
        const current = await Invitation.findById(req.params.id);
        
        if (!current) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }

        const access = await canManageInvitations(current.company, req.userId);
        if (!access.company) return res.status(404).json({ success: false, message: 'Company not found' });
        if (!access.allowed) return res.status(403).json({ success: false, message: 'Permission denied' });
        
        if (current.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Can only resend pending invitations' });
        }
        
        const invitation = await Invitation.findOneAndUpdate(
            { _id: current._id, status: 'pending' },
            { $inc: { 'metadata.sentCount': 1 }, $set: { 'metadata.lastSentAt': new Date() } },
            { new: true }
        );
        if (!invitation) {
            return res.status(400).json({ success: false, message: 'Can only resend pending invitations' });
        }
        
        await invitation.populate('invitedBy', 'fullName email');
        await invitation.populate('company', 'name description');
        
        try {
            await enqueueEmailJob(
                'invitation',
                `invitation:${invitation._id}:${invitation.metadata.sentCount}`,
                { invitationId: invitation._id }
            );
        } catch (queueError) {
            console.error('Failed to queue invitation email:', queueError.message);
        }
        
        res.json({
            success: true,
            message: 'Invitation resent',
            invitation
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

/**
 * @swagger
 * /api/invitations/{id}:
 *   delete:
 *     summary: Cancel an invitation
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation cancelled
 *       404:
 *         description: Invitation not found
 */
// Cancel invitation
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const current = await Invitation.findById(req.params.id);
        if (!current) {
            return res.status(404).json({ success: false, message: 'Invitation not found' });
        }

        const access = await canManageInvitations(current.company, req.userId);
        if (!access.company) return res.status(404).json({ success: false, message: 'Company not found' });
        if (!access.allowed) return res.status(403).json({ success: false, message: 'Permission denied' });
        const invitation = await Invitation.findOneAndDelete({ _id: current._id, status: 'pending' });
        if (!invitation) {
            return res.status(400).json({ success: false, message: 'Only pending invitations can be cancelled' });
        }
        
        res.json({
            success: true,
            message: 'Invitation cancelled'
        });
    } catch (error) {
        return sendInternalError(req, res, error);
    }
});

module.exports = router;
