const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel'
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'file', 'code', 'system'],
        default: 'text'
    },
    attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
    }],
    reactions: [{
        emoji: String,
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    thread: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }],
    parentMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ company: 1 });

module.exports = mongoose.model('Message', messageSchema);
