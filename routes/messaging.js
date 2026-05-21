const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/messaging/channels:
 *   post:
 *     summary: Create a new messaging channel
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               companyId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [public, private, direct]
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Channel created successfully
 */
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

/**
 * @swagger
 * /api/messaging/channels:
 *   get:
 *     summary: Get all channels for a company
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: companyId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of channels
 */
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

/**
 * @swagger
 * /api/messaging/channels/{id}:
 *   get:
 *     summary: Get a single channel by ID
 *     tags:
 *       - Messaging
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
 *         description: Channel details
 *       404:
 *         description: Channel not found
 */
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

/**
 * @swagger
 * /api/messaging/messages:
 *   post:
 *     summary: Send a message to a channel or user
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 example: Hello team!
 *               channelId:
 *                 type: string
 *               recipientId:
 *                 type: string
 *               companyId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, file, code, image]
 *                 default: text
 *               attachments:
 *                 type: array
 *               mentions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Get messages for a channel
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: channelId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: before
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Cursor for pagination - get messages before this timestamp
 *     responses:
 *       200:
 *         description: List of messages (oldest first)
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/messaging/messages/{id}:
 *   put:
 *     summary: Edit a message
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message edited
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Message not found
 *   delete:
 *     summary: Delete a message (soft delete)
 *     tags:
 *       - Messaging
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
 *         description: Message deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Message not found
 */
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

/**
 * @swagger
 * /api/messaging/messages/{id}/reactions:
 *   post:
 *     summary: Add or remove a reaction on a message
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *             required:
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *     responses:
 *       200:
 *         description: Reaction toggled
 *       404:
 *         description: Message not found
 */
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

/**
 * @swagger
 * /api/messaging/messages/{id}/read:
 *   post:
 *     summary: Mark a message as read
 *     tags:
 *       - Messaging
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
 *         description: Message marked as read
 *       404:
 *         description: Message not found
 */
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

/**
 * @swagger
 * /api/messaging/channels/{id}/members:
 *   post:
 *     summary: Add a member to a channel
 *     tags:
 *       - Messaging
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added to channel
 *       404:
 *         description: Channel not found
 */
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
