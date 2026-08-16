const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const MeetingRoom = require('../models/MeetingRoom');
const MeetingOverlay = require('../models/MeetingOverlay');
const Company = require('../models/Company');
const crypto = require('crypto');

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
 * /api/collaboration/overlay/start:
 *   post:
 *     summary: Start an embedded meeting overlay from a specific context
 *     tags:
 *       - Collaboration Overlay
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
 *               title:
 *                 type: string
 *               context:
 *                   type: string
 *                   enum: [editor, sandbox, design-review, debug, general]
 *               targetFileId:
 *                 type: string
 *               targetProjectId:
 *                 type: string
 *               ticketId:
 *                 type: string
 *               debugSessionId:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [public, company, invited]
 *     responses:
 *       201:
 *         description: Meeting overlay started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 meeting:
 *                   type: object
 *                 overlay:
 *                   type: object
 */
router.post('/overlay/start', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { title, context, targetFileId, targetProjectId, ticketId, debugSessionId, mode } = req.body;
        
        const roomId = crypto.randomBytes(16).toString('hex');
        const meeting = await MeetingRoom.create({
            title: title || 'Quick Overlay Call',
            description: `Embedded ${context || 'general'} overlay`,
            company: req.params.companyId,
            host: req.userId,
            roomId,
            status: 'ongoing',
            startedAt: new Date(),
            settings: {
                videoEnabled: true,
                audioEnabled: true,
                screenShareEnabled: true,
                recordingEnabled: false,
                waitingRoom: false,
                maxParticipants: 12
            }
        });
        
        await meeting.populate('host', 'fullName email profilePicture');
        
        const joinToken = crypto.randomBytes(24).toString('hex');
        const overlay = await MeetingOverlay.create({
            meetingId: meeting._id,
            companyId: req.params.companyId,
            hostUserId: req.userId,
            context: {
                type: context || 'general',
                targetFileId: targetFileId || null,
                targetProjectId: targetProjectId || null,
                ticketId: ticketId || null,
                debugSessionId: debugSessionId || null
            },
            access: {
                mode: mode || 'company',
                invitedUserIds: [],
                joinToken
            },
            status: 'active',
            startedAt: new Date()
        });
        
        res.status(201).json({
            success: true,
            meeting,
            overlay: {
                id: overlay._id,
                joinToken,
                embedUrl: `/meeting-room.html?roomId=${roomId}&overlay=true`,
                context: overlay.context
            }
        });
    } catch (error) {
        console.error('Start overlay error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/overlay/{overlayId}/join:
 *   post:
 *     summary: Join an active meeting overlay
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: overlayId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Joined overlay meeting
 */
router.post('/overlay/:overlayId/join', authenticateToken, async (req, res) => {
    try {
        const overlay = await MeetingOverlay.findById(req.params.overlayId);
        if (!overlay || overlay.status !== 'active') {
            return res.status(404).json({ success: false, message: 'Overlay not found or ended' });
        }
        
        const meeting = await MeetingRoom.findById(overlay.meetingId)
            .populate('host', 'fullName email profilePicture');
            
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        const participant = meeting.participants.find(p => p.user.toString() === req.userId);
        if (!participant) {
            meeting.participants.push({
                user: req.userId,
                status: 'joined',
                joinedAt: new Date()
            });
            if (meeting.status === 'scheduled') {
                meeting.status = 'ongoing';
                meeting.startedAt = new Date();
            }
            await meeting.save();
        }
        
        res.json({
            success: true,
            roomId: meeting.roomId,
            overlayId: overlay._id,
            context: overlay.context,
            meeting
        });
    } catch (error) {
        console.error('Join overlay error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/collaboration/overlay/{overlayId}/end:
 *   post:
 *     summary: End an active meeting overlay
 *     tags:
 *       - Collaboration Overlay
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: overlayId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Overlay ended
 */
router.post('/overlay/:overlayId/end', authenticateToken, async (req, res) => {
    try {
        const overlay = await MeetingOverlay.findById(req.params.overlayId);
        if (!overlay) {
            return res.status(404).json({ success: false, message: 'Overlay not found' });
        }
        
        if (overlay.hostUserId.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can end overlay' });
        }
        
        overlay.status = 'ended';
        overlay.endedAt = new Date();
        await overlay.save();
        
        const meeting = await MeetingRoom.findById(overlay.meetingId);
        if (meeting) {
            meeting.status = 'completed';
            meeting.endedAt = new Date();
            await meeting.save();
        }
        
        res.json({ success: true, message: 'Overlay ended' });
    } catch (error) {
        console.error('End overlay error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
