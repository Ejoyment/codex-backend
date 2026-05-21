const express = require('express');
const router = express.Router();
const { authenticateToken: auth } = require('../middleware/auth');
const NotificationService = require('../utils/notificationService');

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: skip
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: unreadOnly
 *         in: query
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/notifications/read-all:
 *   delete:
 *     summary: Delete all read notifications
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All read notifications deleted
 *       401:
 *         description: Unauthorized
 */
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
