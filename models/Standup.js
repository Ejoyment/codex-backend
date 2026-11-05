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
    }],
    // Retention policy: activity/standup history expires after a year by
    // default. Override per deployment without a migration.
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (parseInt(process.env.STANDUP_RETENTION_DAYS || '365', 10) * 24 * 60 * 60 * 1000))
    }
}, {
    timestamps: true
});

standupSchema.index({ company: 1, createdAt: -1 });
standupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Standup', standupSchema);