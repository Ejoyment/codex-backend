// Notification service: persists notifications and pushes them to the client
// in real time.
//
// Design rules that matter:
//  1. Notifications must NEVER break the action that produced them. Every
//     public method swallows errors and returns a result object.
//  2. Persist first, then emit. A dropped socket must not lose the record.
//  3. Callers talk to `notify()` / `notifyMany()`; specific helpers below are
//     thin wrappers so wording and links stay consistent.

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const realtimeBus = require('./realtimeBus');

const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Maps a notification type to the preference category that gates it.
const TYPE_CATEGORY = {
    message: 'messages',
    mention: 'messages',
    direct_message: 'messages',
    standup_posted: 'messages',
    task_assigned: 'tasks',
    task_completed: 'tasks',
    task_status_changed: 'tasks',
    task_comment: 'tasks',
    spec_created: 'specs',
    spec_updated: 'specs',
    spec_verified: 'specs',
    spec_failed: 'specs',
    agent_started: 'agents',
    agent_completed: 'agents',
    agent_failed: 'agents',
    agent_needs_input: 'agents',
    meeting_scheduled: 'meetings',
    meeting_started: 'meetings',
    meeting_ended: 'meetings',
    project_created: 'workspace',
    member_joined: 'workspace',
    member_left: 'workspace',
    member_role_changed: 'workspace',
    channel_created: 'workspace',
    deployment_started: 'deployments',
    deployment_succeeded: 'deployments',
    deployment_failed: 'deployments',
    payment_succeeded: 'billing',
    payment_failed: 'billing',
    subscription_expiring: 'billing',
    trial_expiring: 'billing',
    system_alert: 'workspace',
};

const idOf = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v._id) return String(v._id);
    if (typeof v.toString === 'function') return v.toString();
    return null;
};

const uniqueIds = (list) =>
    [...new Set((list || []).map(idOf).filter(Boolean))];

const DEFAULT_PREFS = {
    enabled: true,
    sound: true,
    soundWhenHiddenOnly: true,
    categories: {
        messages: true,
        tasks: true,
        specs: true,
        agents: true,
        meetings: true,
        workspace: true,
        deployments: true,
        billing: true,
    },
};

function prefsFor(doc) {
    const p = (doc && doc.notificationPrefs) || {};
    return {
        ...DEFAULT_PREFS,
        ...p,
        categories: { ...DEFAULT_PREFS.categories, ...(p.categories || {}) },
    };
}

class NotificationService {
    /**
     * Resolve which recipients actually want this event, given their prefs.
     * Returns the list of user ids to notify.
     */
    static async eligibleRecipients(userIds, type) {
        const candidates = uniqueIds(userIds);
        if (!candidates.length) return [];

        const category = TYPE_CATEGORY[type];
        if (!category) return candidates; // unknown/system type: don't gate it

        const users = await User.find({ _id: { $in: candidates } })
            .select('notificationPrefs')
            .lean();

        const byId = new Map(users.map((u) => [String(u._id), u]));
        return candidates.filter((id) => {
            const prefs = prefsFor(byId.get(id));
            if (!prefs.enabled) return false;
            return prefs.categories[category] !== false;
        });
    }

    /**
     * Find recipients who already have this dedupeKey inside the window, so
     * repeated events collapse instead of flooding the list.
     */
    static async recentlyNotified(userIds, dedupeKey) {
        if (!dedupeKey) return new Set();
        const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
        const rows = await Notification.find({
            userId: { $in: userIds },
            dedupeKey,
            createdAt: { $gte: since },
        })
            .select('userId')
            .lean();
        return new Set(rows.map((r) => String(r.userId)));
    }

    /**
     * Create notifications for one or many users and push each in real time.
     *
     * @param {object} options
     * @param {string[]} options.userIds  recipients (required)
     * @param {string} options.type       one of NOTIFICATION_TYPES
     * @param {string} options.title
     * @param {string} options.message
     * @param {string} [options.actorId]  who triggered it; never notified
     * @param {string} [options.link]     in-app deep link
     * @param {string} [options.priority] low | normal | high
     * @param {string} [options.dedupeKey]
     * @returns {Promise<{created: number, skipped: number, error: ?string}>}
     */
    static async notify({
        userIds,
        type,
        title,
        message,
        actorId = null,
        actorName = null,
        actorAvatar = null,
        company = null,
        project = null,
        channel = null,
        task = null,
        data = {},
        link = null,
        priority = 'normal',
        dedupeKey = null,
    }) {
        const actor = idOf(actorId);
        try {
            if (!type) throw new Error('notify() requires a type');
            if (!title || !message) throw new Error('notify() requires title and message');

            let recipients = uniqueIds(userIds).filter((id) => id !== actor);
            if (!recipients.length) return { created: 0, skipped: 0 };

            recipients = await this.eligibleRecipients(recipients, type);
            if (!recipients.length) return { created: 0, skipped: 0 };

            if (dedupeKey) {
                const seen = await this.recentlyNotified(recipients, dedupeKey);
                const before = recipients.length;
                recipients = recipients.filter((id) => !seen.has(id));
                if (!recipients.length) {
                    return { created: 0, skipped: before };
                }
            }

            const now = new Date();
            const docs = recipients.map((userId) => ({
                userId,
                type,
                title,
                message,
                actor: actor,
                actorName,
                actorAvatar,
                company: idOf(company),
                project: idOf(project),
                channel: idOf(channel),
                task: idOf(task),
                data,
                priority,
                link,
                dedupeKey,
                createdAt: now,
                updatedAt: now,
            }));

            const saved = await Notification.insertMany(docs, { ordered: false });

            for (const n of saved) {
                realtimeBus.emitNotification(String(n.userId), n.toJSON());
            }

            return { created: saved.length, skipped: 0 };
        } catch (error) {
            // A failed notification must not fail the request that caused it.
            console.error('[notifications] notify failed:', error.message);
            return { created: 0, skipped: 0, error: error.message };
        }
    }

    /** Single-recipient convenience wrapper. */
    static async notifyUser(userId, options) {
        return this.notify({ ...options, userIds: [userId] });
    }

    // ---------------------------------------------------------------- reads

    static async getNotifications(userId, { limit = DEFAULT_LIMIT, skip = 0, unreadOnly = false } = {}) {
        const id = idOf(userId);
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
        const safeSkip = Math.max(parseInt(skip, 10) || 0, 0);

        return Notification.find({
            userId: id,
            ...(unreadOnly ? { read: false } : {}),
        })
            .sort({ createdAt: -1 })
            .skip(safeSkip)
            .limit(safeLimit)
            .lean({ virtuals: true });
    }

    static async getUnreadCount(userId) {
        return Notification.countDocuments({ userId: idOf(userId), read: false });
    }

    /** Unread counts grouped by category, used to render the bell summary. */
    static async getUnreadByCategory(userId) {
        const id = idOf(userId);
        if (!mongoose.Types.ObjectId.isValid(id)) return {};
        const rows = await Notification.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(id), read: false } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);
        const byCategory = {};
        for (const row of rows) {
            const cat = TYPE_CATEGORY[row._id];
            if (cat) byCategory[cat] = (byCategory[cat] || 0) + row.count;
        }
        return byCategory;
    }

    // ------------------------------------------------------------ mutations

    /** Scoped by userId so one user can never touch another's notification. */
    static async markAsRead(notificationId, userId) {
        return Notification.findOneAndUpdate(
            { _id: notificationId, userId: idOf(userId) },
            { read: true, readAt: new Date() },
            { new: true }
        ).lean();
    }

    static async markAllAsRead(userId) {
        const result = await Notification.updateMany(
            { userId: idOf(userId), read: false },
            { read: true, readAt: new Date() }
        );
        return result.modifiedCount || 0;
    }

    static async deleteNotification(notificationId, userId) {
        const result = await Notification.findOneAndDelete({
            _id: notificationId,
            userId: idOf(userId),
        });
        return result ? result.toObject() : null;
    }

    static async deleteAllRead(userId) {
        const result = await Notification.deleteMany({
            userId: idOf(userId),
            read: true,
        });
        return result.deletedCount || 0;
    }

    // ---------------------------------------------------------- preferences

    static async getPreferences(userId) {
        const user = await User.findById(idOf(userId)).select('notificationPrefs').lean();
        return prefsFor(user);
    }

    static async updatePreferences(userId, patch = {}) {
        const update = { $set: {} };
        for (const key of ['enabled', 'sound', 'soundWhenHiddenOnly']) {
            if (typeof patch[key] === 'boolean') update.$set[`notificationPrefs.${key}`] = patch[key];
        }
        if (patch.categories && typeof patch.categories === 'object') {
            for (const key of Object.keys(DEFAULT_PREFS.categories)) {
                if (typeof patch.categories[key] === 'boolean') {
                    update.$set[`notificationPrefs.categories.${key}`] = patch.categories[key];
                }
            }
        }
        if (!Object.keys(update.$set).length) return this.getPreferences(userId);

        await User.updateOne({ _id: idOf(userId) }, update);
        return this.getPreferences(userId);
    }
}

module.exports = NotificationService;
module.exports.TYPE_CATEGORY = TYPE_CATEGORY;
module.exports.DEFAULT_PREFS = DEFAULT_PREFS;
module.exports.DEDUPE_WINDOW_MS = DEDUPE_WINDOW_MS;
