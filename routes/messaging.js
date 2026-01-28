const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const { authenticateToken } = require('../middleware/auth');

// Create channel
router.post('/channels', authenticateToken, async (req, res) => {
    try {
        const { name, description, companyId, type, members } = req.body;
        
        const channel = await Channel.create({
            name,
            description,
            company: companyId,
            type: type || 'public',
            createdBy: req.userId,
            members: [
                { user: req.userId, role: 'admin' },
                ...(members || []).map(userId => ({ user: userId, role: 'member' }))
            ]
        });
        
        await channel.populate('members.user', 'fullName email profilePicture');
        await channel.populate('createdBy', 'fullName email profilePicture');
        
        res.json({
            success: true,
            channel
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all channels for company
router.get('/channels', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.query;
        
        const channels = await Channel.find({
            company: companyId,
            archived: false,
            'members.user': req.userId
        })
            .populate('members.user', 'fullName email profilePicture')
            .populate('lastMessage')
            .sort({ lastMessageAt: -1 });
        
        res.json({
            success: true,
            channels
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single channel
router.get('/channels/:id', authenticateToken, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id)
            .populate('members.user', 'fullName email profilePicture')
            .populate('createdBy', 'fullName email profilePicture')
            .populate('pinnedMessages');
        
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Channel not found' });
        }
        
        res.json({
            success: true,
            channel
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send message
router.post('/messages', authenticateToken, async (req, res) => {
    try {
        const { content, channelId, recipientId, companyId, type, attachments, mentions } = req.body;
        
        const message = await Message.create({
            content,
            sender: req.userId,
            channel: channelId,
            recipient: recipientId,
            company: companyId,
            type: type || 'text',
            attachments: attachments || [],
            mentions: mentions || []
        });
        
        await message.populate('sender', 'fullName email profilePicture');
        
        // Update channel last message
        if (channelId) {
            await Channel.findByIdAndUpdate(channelId, {
                lastMessage: message._id,
                lastMessageAt: new Date()
            });
        }
        
        res.json({
            success: true,
            message
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get messages for channel
router.get('/messages', authenticateToken, async (req, res) => {
    try {
        const { channelId, limit = 50, before } = req.query;
        
        const query = {
            channel: channelId,
            deleted: false
        };
        
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }
        
        const messages = await Message.find(query)
            .populate('sender', 'fullName email profilePicture')
            .populate('mentions', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            messages: messages.reverse()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Edit message
router.put('/messages/:id', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        if (message.sender.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }
        
        message.content = content;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();
        
        res.json({
            success: true,
            message
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete message
router.delete('/messages/:id', authenticateToken, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        if (message.sender.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }
        
        message.deleted = true;
        message.deletedAt = new Date();
        await message.save();
        
        res.json({
            success: true,
            message: 'Message deleted'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add reaction
router.post('/messages/:id/reactions', authenticateToken, async (req, res) => {
    try {
        const { emoji } = req.body;
        
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        // Check if already reacted
        const existing = message.reactions.find(r => 
            r.user.toString() === req.userId && r.emoji === emoji
        );
        
        if (existing) {
            // Remove reaction
            message.reactions = message.reactions.filter(r => 
                !(r.user.toString() === req.userId && r.emoji === emoji)
            );
        } else {
            // Add reaction
            message.reactions.push({ emoji, user: req.userId });
        }
        
        await message.save();
        
        res.json({
            success: true,
            message
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark as read
router.post('/messages/:id/read', authenticateToken, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        const existing = message.readBy.find(r => r.user.toString() === req.userId);
        
        if (!existing) {
            message.readBy.push({ user: req.userId });
            await message.save();
        }
        
        res.json({
            success: true
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add member to channel
router.post('/channels/:id/members', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        
        const channel = await Channel.findById(req.params.id);
        
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Channel not found' });
        }
        
        const existing = channel.members.find(m => m.user.toString() === userId);
        
        if (!existing) {
            channel.members.push({ user: userId, role: 'member' });
            await channel.save();
        }
        
        await channel.populate('members.user', 'fullName email profilePicture');
        
        res.json({
            success: true,
            channel
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
