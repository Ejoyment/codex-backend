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
    }
}, {
    timestamps: true
});

teamActivitySchema.index({ company: 1, createdAt: -1 });
teamActivitySchema.index({ user: 1 });

module.exports = mongoose.model('TeamActivity', teamActivitySchema);
