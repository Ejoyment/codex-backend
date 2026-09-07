const mongoose = require('mongoose');

const teamChatSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    channel: {
        type: String,
        default: 'general'
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'file', 'image', 'code', 'system'],
        default: 'text'
    },
    attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
    }],
    mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeamChat'
    },
    reactions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: String
    }],
    isEdited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

teamChatSchema.index({ company: 1, channel: 1, createdAt: -1 });
teamChatSchema.index({ sender: 1 });

module.exports = mongoose.model('TeamChat', teamChatSchema);
