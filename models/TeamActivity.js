const mongoose = require('mongoose');

const teamActivitySchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: [
            'task_created', 'task_updated', 'task_completed',
            'project_created', 'project_updated',
            'member_joined', 'member_left',
            'role_updated', 'role_bulk_updated', 'role_backfilled',
            'meeting_scheduled', 'meeting_completed',
            'file_uploaded', 'comment_added'
        ],
        required: true
    },
    action: {
        type: String,
        required: true
    },
    metadata: {
        taskId: mongoose.Schema.Types.ObjectId,
        projectId: mongoose.Schema.Types.ObjectId,
        meetingId: mongoose.Schema.Types.ObjectId,
        targetUser: mongoose.Schema.Types.ObjectId,
        oldValue: String,
        newValue: String
    },
    // Retention policy: activity/standup history expires after a year by
    // default. Override per deployment without a migration.
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (parseInt(process.env.TEAM_ACTIVITY_RETENTION_DAYS || '365', 10) * 24 * 60 * 60 * 1000))
    }
}, {
    timestamps: true
});

teamActivitySchema.index({ company: 1, createdAt: -1 });
teamActivitySchema.index({ user: 1 });
teamActivitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TeamActivity', teamActivitySchema);
