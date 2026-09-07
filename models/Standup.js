const mongoose = require('mongoose');

const standupSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel'
    },
    yesterday: {
        type: String,
        default: ''
    },
    today: {
        type: String,
        default: ''
    },
    blockers: {
        type: String,
        default: ''
    },
    relatedTasks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LocalTask'
    }]
}, {
    timestamps: true
});

standupSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Standup', standupSchema);