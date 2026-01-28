const express = require('express');
const router = express.Router();
const MeetingRoom = require('../models/MeetingRoom');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

// Create meeting
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { title, description, companyId, scheduledAt, duration, participants, settings } = req.body;
        
        const roomId = crypto.randomBytes(16).toString('hex');
        
        const meeting = await MeetingRoom.create({
            title,
            description,
            company: companyId,
            host: req.userId,
            scheduledAt,
            duration: duration || 60,
            roomId,
            participants: (participants || []).map(userId => ({
                user: userId,
                status: 'invited'
            })),
            settings: settings || {}
        });
        
        await meeting.populate('host', 'fullName email profilePicture');
        await meeting.populate('participants.user', 'fullName email profilePicture');
        
        res.json({
            success: true,
            meeting
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all meetings for company
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { companyId, status, upcoming } = req.query;
        
        const query = { company: companyId };
        
        if (status) {
            query.status = status;
        }
        
        if (upcoming === 'true') {
            query.scheduledAt = { $gte: new Date() };
            query.status = { $in: ['scheduled', 'ongoing'] };
        }
        
        const meetings = await MeetingRoom.find(query)
            .populate('host', 'fullName email profilePicture')
            .populate('participants.user', 'fullName email profilePicture')
            .sort({ scheduledAt: 1 });
        
        res.json({
            success: true,
            meetings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single meeting
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id)
            .populate('host', 'fullName email profilePicture')
            .populate('participants.user', 'fullName email profilePicture');
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        res.json({
            success: true,
            meeting
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get meeting by room ID
router.get('/room/:roomId', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findOne({ roomId: req.params.roomId })
            .populate('host', 'fullName email profilePicture')
            .populate('participants.user', 'fullName email profilePicture');
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        res.json({
            success: true,
            meeting
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update meeting
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { title, description, scheduledAt, duration, settings } = req.body;
        
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        if (meeting.host.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can update meeting' });
        }
        
        if (title) meeting.title = title;
        if (description) meeting.description = description;
        if (scheduledAt) meeting.scheduledAt = scheduledAt;
        if (duration) meeting.duration = duration;
        if (settings) meeting.settings = { ...meeting.settings, ...settings };
        
        await meeting.save();
        await meeting.populate('host', 'fullName email profilePicture');
        await meeting.populate('participants.user', 'fullName email profilePicture');
        
        res.json({
            success: true,
            meeting
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Join meeting
router.post('/:id/join', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        const participant = meeting.participants.find(p => p.user.toString() === req.userId);
        
        if (participant) {
            participant.status = 'joined';
            participant.joinedAt = new Date();
        } else {
            meeting.participants.push({
                user: req.userId,
                status: 'joined',
                joinedAt: new Date()
            });
        }
        
        if (meeting.status === 'scheduled') {
            meeting.status = 'ongoing';
            meeting.startedAt = new Date();
        }
        
        await meeting.save();
        
        res.json({
            success: true,
            meeting,
            roomId: meeting.roomId
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Leave meeting
router.post('/:id/leave', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        const participant = meeting.participants.find(p => p.user.toString() === req.userId);
        
        if (participant) {
            participant.status = 'left';
            participant.leftAt = new Date();
        }
        
        await meeting.save();
        
        res.json({
            success: true,
            message: 'Left meeting'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// End meeting
router.post('/:id/end', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        if (meeting.host.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can end meeting' });
        }
        
        meeting.status = 'completed';
        meeting.endedAt = new Date();
        
        await meeting.save();
        
        res.json({
            success: true,
            message: 'Meeting ended'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start recording
router.post('/:id/record/start', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        if (meeting.host.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can start recording' });
        }
        
        meeting.recording = {
            startedAt: new Date()
        };
        
        await meeting.save();
        
        res.json({
            success: true,
            message: 'Recording started'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Stop recording
router.post('/:id/record/stop', authenticateToken, async (req, res) => {
    try {
        const { url, size } = req.body;
        
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        if (meeting.host.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can stop recording' });
        }
        
        meeting.recording.endedAt = new Date();
        meeting.recording.url = url;
        meeting.recording.size = size;
        
        await meeting.save();
        
        res.json({
            success: true,
            message: 'Recording stopped',
            recording: meeting.recording
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete meeting
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const meeting = await MeetingRoom.findById(req.params.id);
        
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        if (meeting.host.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Only host can delete meeting' });
        }
        
        await meeting.deleteOne();
        
        res.json({
            success: true,
            message: 'Meeting deleted'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
