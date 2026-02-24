const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: [
            // GitHub events
            'github_commit', 'github_pr', 'github_pr_merged', 'github_issue', 
            'github_issue_closed', 'github_repo_created', 'github_branch_created',
            // Discord events
            'discord_message', 'discord_mention', 'discord_dm',
            // Slack events
            'slack_message', 'slack_mention', 'slack_dm',
            // Team events
            'team_message', 'task_assigned', 'task_completed', 
            'team_member_joined', 'meeting_scheduled',
            // Figma events
            'figma_comment', 'figma_file_updated',
            // Notion events
            'notion_page_updated', 'notion_task_assigned',
            // System events
            'system_alert', 'payment_success', 'payment_failed'
        ]
    },
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        maxlength: 500
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    link: {
        type: String,
        default: null
    },
    icon: {
        type: String,
        default: 'bell'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        index: true
    }
});

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Virtual for time ago
notificationSchema.virtual('timeAgo').get(function() {
    const now = new Date();
    const diff = Math.floor((now - this.createdAt) / 1000); // seconds
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return this.createdAt.toLocaleDateString();
});

notificationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Notification', notificationSchema);
