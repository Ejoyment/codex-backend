const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        enum: ['mention', 'message', 'invitation', 'task', 'meeting', 'system'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: String,
    link: String,
    data: mongoose.Schema.Types.Mixed,
    read: {
        type: Boolean,
        default: false
    },
    readAt: Date,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    }
}, {
    timestamps: true
});

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ company: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
