const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const NotificationService = require('../utils/notificationService');

// Get user notifications
router.get('/', auth, async (req, res) => {
    try {
        const { limit = 50, skip = 0, unreadOnly = false } = req.query;
        const userId = req.userId || req.user.userId || req.user.id;

        const notifications = await NotificationService.getNotifications(
            userId,
            parseInt(limit),
            parseInt(skip),
            unreadOnly === 'true'
        );

        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notifications'
        });
    }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const count = await NotificationService.getUnreadCount(userId);

        res.json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count'
        });
    }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const notificationId = req.params.id;

        const notification = await NotificationService.markAsRead(notificationId, userId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            notification
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read'
        });
    }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const result = await NotificationService.markAllAsRead(userId);

        res.json({
            success: true,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all as read'
        });
    }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const notificationId = req.params.id;

        const result = await NotificationService.deleteNotification(notificationId, userId);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification deleted'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification'
        });
    }
});

// Delete all read notifications
router.delete('/read-all', auth, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const result = await NotificationService.deleteAllRead(userId);

        res.json({
            success: true,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Delete all read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete read notifications'
        });
    }
});

module.exports = router;
