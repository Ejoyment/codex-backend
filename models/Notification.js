const mongoose = require('mongoose');

/**
 * Event types are limited to things this product actually does. Adding a type
 * here means a trigger and a frontend renderer exist for it.
 */
const NOTIFICATION_TYPES = [
    // Messaging
    'message',
    'mention',
    'direct_message',
    'standup_posted',
    // Tasks
    'task_assigned',
    'task_completed',
    'task_status_changed',
    'task_comment',
    // Specs
    'spec_created',
    'spec_updated',
    'spec_verified',
    'spec_failed',
    // Agents
    'agent_started',
    'agent_completed',
    'agent_failed',
    'agent_needs_input',
    // Meetings
    'meeting_scheduled',
    'meeting_started',
    'meeting_ended',
    // Workspace
    'project_created',
    'member_joined',
    'member_left',
    'member_role_changed',
    'channel_created',
    // Deployments
    'deployment_started',
    'deployment_succeeded',
    'deployment_failed',
    // Billing
    'payment_succeeded',
    'payment_failed',
    'subscription_expiring',
    'trial_expiring',
    // System
    'system_alert',
];

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: NOTIFICATION_TYPES,
        },
        title: {
            type: String,
            required: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: true,
            maxlength: 500,
        },
        // Who caused it. Null for system/billing events.
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // Denormalized so the bell can render without extra lookups.
        actorName: { type: String, default: null, maxlength: 120 },
        actorAvatar: { type: String, default: null },

        // Context for rendering + deep links.
        company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamProject', default: null },
        channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
        task: { type: mongoose.Schema.Types.ObjectId, default: null },

        data: { type: mongoose.Schema.Types.Mixed, default: {} },

        // low: silent list entry | normal: standard | high: toast + audible
        priority: {
            type: String,
            enum: ['low', 'normal', 'high'],
            default: 'normal',
        },
        link: { type: String, default: null },

        read: { type: Boolean, default: false },
        readAt: { type: Date, default: null },

        /**
         * Collapse repeats of the same event (e.g. repeated mentions in one
         * thread) inside the dedupe window instead of flooding the list.
         */
        dedupeKey: { type: String, default: null },

        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

notificationSchema.virtual('timeAgo').get(function () {
    const diff = Math.floor((Date.now() - new Date(this.createdAt).getTime()) / 1000);
    if (Number.isNaN(diff)) return '';
    if (diff < 0) return 'just now';
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(this.createdAt).toLocaleDateString();
});

notificationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
