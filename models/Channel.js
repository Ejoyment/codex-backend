const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    type: {
        type: String,
        // announcement: visible to the whole company like public, but only
        // channel admins may post (enforced in routes/messaging.js)
        enum: ['public', 'private', 'direct', 'announcement'],
        default: 'public'
    },
    members: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['admin', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pinnedMessages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }],
    archived: {
        type: Boolean,
        default: false
    },
    archivedAt: Date,
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastMessageAt: Date
}, {
    timestamps: true
});

channelSchema.index({ company: 1, name: 1 });
channelSchema.index({ members: 1 });

module.exports = mongoose.model('Channel', channelSchema);
