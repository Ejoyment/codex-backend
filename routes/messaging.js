const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const { authenticateToken } = require('../middleware/auth');
const Company = require('../models/Company');
const { CHANNEL_TYPES, normalizeChannelType, canPostToChannel } = require('../utils/channelPolicy');

// Verify user is a member of the company before operating
async function requireCompanyMember(req, res, next) {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return next();
    try {
        const company = await Company.findById(companyId).select('members');
        if (!company) return res.status(404).json({ error: 'Company not found' });
        const isMember = company.members.some(m => m.user?.toString() === req.userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied: not a company member' });
        next();
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify company access' });
    }
}

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
router.post('/channels', authenticateToken, requireCompanyMember, async (req, res) => {
    try {
        const { description, companyId, type, members } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }

        const name = String(req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Channel name is required' });
        }

        const channelType = normalizeChannelType(type);
        if (!channelType) {
            return res.status(400).json({
                success: false,
                message: `Invalid channel type "${type}". Expected one of: ${CHANNEL_TYPES.join(', ')}`
            });
        }

        const duplicate = await Channel.findOne({ company: companyId, name, archived: false })
            .select('_id');
        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: `A channel named "${name}" already exists`
            });
        }

        const memberIds = [...new Set(
            (members || [])
                .map(String)
                .filter(id => id && id !== String(req.userId))
        )];

        const channel = await Channel.create({
            name,
            description: description ? String(description).trim() : undefined,
            company: companyId,
            type: channelType,
            createdBy: req.userId,
            members: [
                { user: req.userId, role: 'admin' },
                ...memberIds.map(userId => ({ user: userId, role: 'member' }))
            ]
        });
        
        await channel.populate('members.user', 'fullName email profilePicture');
        await channel.populate('createdBy', 'fullName email profilePicture');
        
        res.status(201).json({
            success: true,
            channel
        });
    } catch (error) {
        // Bad input is the client's fault; report it as such instead of an
        // opaque 500 that the UI can only surface as "something went wrong".
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ success: false, message: error.message });
        }
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
router.get('/channels', authenticateToken, requireCompanyMember, async (req, res) => {
    try {
        const companyId = req.query.companyId != null ? String(req.query.companyId) : req.query.companyId;
        
        // Public and announcement channels are visible to ALL company members;
        // private/direct channels are visible only to their members
        const channels = await Channel.find({
            company: companyId,
            archived: false,
            $or: [
                { type: { $in: ['public', 'announcement'] } },
                { 'members.user': req.userId }
            ]
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
router.get('/channels/:id', authenticateToken, requireCompanyMember, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id)
            .populate('members.user', 'fullName email profilePicture')
            .populate('createdBy', 'fullName email profilePicture')
            .populate('pinnedMessages');
        
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Channel not found' });
        }

        const isChannelMember = (channel.members || []).some(m => String(m.user?._id || m.user) === String(req.userId));
        if (!isChannelMember) {
            const companyId = channel.company ? String(channel.company) : (req.query.companyId != null ? String(req.query.companyId) : null);
            if (companyId) {
                try {
                    const company = await Company.findById(companyId).select('members owner');
                    const isCompanyMember = company && ((company.members || []).some(m => String(m.user) === String(req.userId)) || (company.owner != null && String(company.owner) === String(req.userId)));
                    if (!isCompanyMember) return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
                } catch (err) {
                    return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
                }
            } else {
                return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
            }
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
router.post('/messages', authenticateToken, requireCompanyMember, async (req, res) => {
    try {
        const { content, channelId, recipientId, type, attachments, mentions } = req.body;
        let companyId = req.body.companyId;

        if (!String(content || '').trim()) {
            return res.status(400).json({ success: false, message: 'Message content is required' });
        }

        if (channelId) {
            const channel = await Channel.findById(String(channelId)).select('company members type');
            if (!channel) {
                return res.status(404).json({ success: false, message: 'Channel not found' });
            }
            if (companyId != null && channel.company != null && String(channel.company) !== String(companyId)) {
                return res.status(403).json({ success: false, message: 'Channel does not belong to this company' });
            }
            const post = canPostToChannel(channel, req.userId);
            if (!post.ok) {
                return res.status(403).json({ success: false, message: post.reason });
            }
            // The channel is the authority on which company a message belongs
            // to; clients that omit companyId still get a valid document.
            if (companyId == null) {
                companyId = channel.company;
            }
        }

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }
        
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
router.get('/messages', authenticateToken, requireCompanyMember, async (req, res) => {
    try {
        const channelId = req.query.channelId != null ? String(req.query.channelId) : req.query.channelId;
        const { limit = 50, before, companyId: rawCompanyId } = req.query;
        const queryCompanyId = rawCompanyId != null ? String(rawCompanyId) : rawCompanyId;

        if (channelId) {
            const channel = await Channel.findById(channelId).select('company members');
            if (!channel) {
                return res.status(404).json({ success: false, message: 'Channel not found' });
            }
            const isMember = (channel.members || []).some(m => String(m.user) === String(req.userId));
            if (!isMember) {
                return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
            }
            if (queryCompanyId != null && channel.company != null && String(channel.company) !== String(queryCompanyId)) {
                return res.status(403).json({ success: false, message: 'Channel does not belong to this company' });
            }
        }
        
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

        if (message.channel) {
            const channel = await Channel.findById(String(message.channel)).select('members');
            if (!channel) {
                return res.status(404).json({ success: false, message: 'Channel not found' });
            }
            const isMember = (channel.members || []).some(m => String(m.user) === String(req.userId));
            if (!isMember) {
                return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
            }
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

        if (message.channel) {
            const channel = await Channel.findById(String(message.channel)).select('members');
            if (!channel) {
                return res.status(404).json({ success: false, message: 'Channel not found' });
            }
            const isMember = (channel.members || []).some(m => String(m.user) === String(req.userId));
            if (!isMember) {
                return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
            }
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
        const { userId, role } = req.body;
        
        const channel = await Channel.findById(req.params.id);
        
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Channel not found' });
        }

        const requester = (channel.members || []).find(m => String(m.user) === String(req.userId));
        if (!requester) {
            return res.status(403).json({ success: false, message: 'Access denied: not a channel member' });
        }
        const roleToGrant = role || 'member';
        if (roleToGrant !== 'member' && requester.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied: only channel admins can grant admin role' });
        }
        
        const existing = channel.members.find(m => m.user.toString() === userId);
        
        if (!existing) {
            channel.members.push({ user: userId, role: roleToGrant });
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
