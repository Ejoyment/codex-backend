const Notification = require('../models/Notification');

class NotificationService {
    // Create a new notification
    static async createNotification(userId, type, title, message, data = {}, link = null, icon = 'bell') {
        try {
            const notification = new Notification({
                userId,
                type,
                title,
                message,
                data,
                link,
                icon
            });

            await notification.save();
            console.log(`Notification created for user ${userId}: ${type}`);
            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    // Get notifications for a user
    static async getNotifications(userId, limit = 50, skip = 0, unreadOnly = false) {
        try {
            const query = { userId };
            if (unreadOnly) {
                query.read = false;
            }

            const notifications = await Notification.find(query)
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(skip)
                .lean();

            return notifications;
        } catch (error) {
            console.error('Error getting notifications:', error);
            throw error;
        }
    }

    // Get unread count
    static async getUnreadCount(userId) {
        try {
            const count = await Notification.countDocuments({
                userId,
                read: false
            });

            return count;
        } catch (error) {
            console.error('Error getting unread count:', error);
            throw error;
        }
    }

    // Mark notification as read
    static async markAsRead(notificationId, userId) {
        try {
            const notification = await Notification.findOneAndUpdate(
                { _id: notificationId, userId },
                { read: true },
                { new: true }
            );

            return notification;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    // Mark all notifications as read
    static async markAllAsRead(userId) {
        try {
            const result = await Notification.updateMany(
                { userId, read: false },
                { read: true }
            );

            return result;
        } catch (error) {
            console.error('Error marking all as read:', error);
            throw error;
        }
    }

    // Delete notification
    static async deleteNotification(notificationId, userId) {
        try {
            const result = await Notification.findOneAndDelete({
                _id: notificationId,
                userId
            });

            return result;
        } catch (error) {
            console.error('Error deleting notification:', error);
            throw error;
        }
    }

    // Delete all read notifications
    static async deleteAllRead(userId) {
        try {
            const result = await Notification.deleteMany({
                userId,
                read: true
            });

            return result;
        } catch (error) {
            console.error('Error deleting read notifications:', error);
            throw error;
        }
    }

    // GitHub notification helpers
    static async notifyGitHubCommit(userId, repoName, commitMessage, commitUrl) {
        return this.createNotification(
            userId,
            'github_commit',
            'New Commit',
            `${commitMessage.substring(0, 100)} in ${repoName}`,
            { repoName, commitMessage, commitUrl },
            commitUrl,
            'github'
        );
    }

    static async notifyGitHubPR(userId, repoName, prNumber, prTitle, prUrl) {
        return this.createNotification(
            userId,
            'github_pr',
            'New Pull Request',
            `PR #${prNumber}: ${prTitle} in ${repoName}`,
            { repoName, prNumber, prTitle, prUrl },
            prUrl,
            'github'
        );
    }

    // Discord notification helpers
    static async notifyDiscordMessage(userId, channelName, author, messagePreview) {
        return this.createNotification(
            userId,
            'discord_message',
            'New Discord Message',
            `${author} in #${channelName}: ${messagePreview.substring(0, 100)}`,
            { channelName, author, messagePreview },
            null,
            'discord'
        );
    }

    // Team notification helpers
    static async notifyTeamMessage(userId, teamName, author, messagePreview) {
        return this.createNotification(
            userId,
            'team_message',
            'New Team Message',
            `${author} in ${teamName}: ${messagePreview.substring(0, 100)}`,
            { teamName, author, messagePreview },
            '/teams.html',
            'team'
        );
    }

    static async notifyTaskAssigned(userId, taskName, assignedBy) {
        return this.createNotification(
            userId,
            'task_assigned',
            'Task Assigned',
            `${assignedBy} assigned you to: ${taskName}`,
            { taskName, assignedBy },
            '/tasks.html',
            'task'
        );
    }
}

module.exports = NotificationService;
