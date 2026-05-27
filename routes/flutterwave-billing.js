const express = require('express');
const router = express.Router();
const flw = require('../config/flutterwave');
const { authenticateToken } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const FlutterwaveScheduler = require('../utils/flutterwaveScheduler');

/**
 * @swagger
 * /api/flutterwave-billing/initialize:
 *   post:
 *     summary: Initialize Flutterwave payment (get payment link)
 *     tags:
 *       - Flutterwave Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *       503:
 *         description: Flutterwave not configured
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.post('/initialize', authenticateToken, async (req, res) => {
    try {
        // Check if Flutterwave is configured
        if (!process.env.FLUTTERWAVE_PUBLIC_KEY || !process.env.FLUTTERWAVE_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Flutterwave payment service is not configured',
                error: 'Please set FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables'
            });
        }

        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create payment payload
        const payload = {
            tx_ref: `txref_${Date.now()}_${userId}`,
            amount: 100, // ₦10,000 (Flutterwave uses kobo, so 10000 * 100)
            currency: 'NGN',
            redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/payment-success.html`,
            customer: {
                email: user.email,
                name: user.fullName,
            },
            customizations: {
                title: 'BuildrsHQ Subscription',
                description: '14-day trial with card - First charge in 10 seconds',
                logo: 'https://your-logo-url.com/logo.png',
            },
            payment_options: 'card,banktransfer,ussd',
        };

        const response = await flw.Payment.initialize(payload);

        if (response.status === 'success') {
            res.json({
                success: true,
                paymentLink: response.data.link,
                reference: payload.tx_ref
            });
        } else {
            throw new Error(response.message || 'Payment initialization failed');
        }

    } catch (error) {
        console.error('Initialize payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error initializing payment',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/flutterwave-billing/verify:
 *   post:
 *     summary: Verify Flutterwave payment and setup subscription
 *     tags:
 *       - Flutterwave Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transaction_id:
 *                 type: string
 *                 description: Flutterwave transaction ID
 *     responses:
 *       200:
 *         description: Payment verified and subscription created
 *       503:
 *         description: Flutterwave not configured
 *       400:
 *         description: Payment verification failed
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.post('/verify', authenticateToken, async (req, res) => {
    try {
        // Check if Flutterwave is configured
        if (!process.env.FLUTTERWAVE_PUBLIC_KEY || !process.env.FLUTTERWAVE_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Flutterwave payment service is not configured',
                error: 'Please set FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables'
            });
        }

        const { transaction_id } = req.body;
        const userId = req.user.userId;

        if (!transaction_id) {
            return res.status(400).json({ success: false, message: 'Transaction ID required' });
        }

        // Verify transaction with Flutterwave
        const response = await flw.Transaction.verify({ id: transaction_id });

        if (response.data.status === 'successful' && response.data.amount >= 100) {
            const user = await User.findById(userId);
            const cardAddedAt = new Date();

            // Get card token for future charges
            const cardToken = response.data.card.token;
            const customerId = response.data.customer.id;

            // Create or update subscription
            let subscription = await Subscription.findOne({ userId });

            if (!subscription) {
                subscription = new Subscription({
                    userId,
                    tier: 'professional',
                    status: 'trial',
                    isTrialWithCard: true,
                    cardAddedAt,
                    trialEndsAt: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)), // 14 days
                    customerId,
                    paymentId: cardToken,
                    paymentProvider: 'flutterwave',
                    email: user.email,
                    pricing: {
                        amount: 10000,
                        currency: 'NGN',
                        interval: 'monthly'
                    }
                });
            } else {
                subscription.isTrialWithCard = true;
                subscription.cardAddedAt = cardAddedAt;
                subscription.customerId = customerId;
                subscription.paymentId = cardToken;
                subscription.status = 'trial';
                subscription.tier = 'professional';
                subscription.email = user.email;
                subscription.trialEndsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));
            }

            // Enable professional features during trial
            subscription.upgradeTo('professional');
            await subscription.save();

            // Schedule first charge (10 seconds from now)
            await FlutterwaveScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt);

            res.json({
                success: true,
                message: 'Payment verified successfully',
                subscription: {
                    status: subscription.status,
                    tier: subscription.tier,
                    trialEndsAt: subscription.trialEndsAt,
                    firstChargeAt: new Date(cardAddedAt.getTime() + (10 * 1000))
                }
            });

        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/flutterwave-billing/status:
 *   get:
 *     summary: Get Flutterwave billing status
 *     tags:
 *       - Flutterwave Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Billing status information
 *       401:
 *         description: Unauthorized
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.json({
                success: true,
                hasSubscription: false
            });
        }

        const BillingSchedule = require('../models/BillingSchedule');
        const pendingCharges = await BillingSchedule.find({
            userId,
            status: 'pending'
        }).sort({ scheduledFor: 1 });

        const completedCharges = await BillingSchedule.find({
            userId,
            status: 'completed'
        }).sort({ completedAt: -1 }).limit(5);

        res.json({
            success: true,
            hasSubscription: true,
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                isTrialWithCard: subscription.isTrialWithCard,
                trialEndsAt: subscription.trialEndsAt,
                cardAddedAt: subscription.cardAddedAt,
                firstChargeAt: subscription.firstChargeAt,
                firstChargeCompleted: subscription.firstChargeCompleted,
                nextBillingDate: subscription.nextBillingDate,
                billingCycle: subscription.billingCycle,
                amount: subscription.pricing.amount,
                currency: subscription.pricing.currency
            },
            pendingCharges: pendingCharges.map(c => ({
                type: c.chargeType,
                scheduledFor: c.scheduledFor,
                amount: c.amount / 100 // Convert kobo to naira
            })),
            recentCharges: completedCharges.map(c => ({
                type: c.chargeType,
                completedAt: c.completedAt,
                amount: c.amount / 100
            }))
        });

    } catch (error) {
        console.error('Get billing status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching billing status',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/flutterwave-billing/cancel:
 *   post:
 *     summary: Cancel Flutterwave subscription
 *     tags:
 *       - Flutterwave Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *       404:
 *         description: No subscription found
 *       401:
 *         description: Unauthorized
 */
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        // Cancel all pending charges
        await FlutterwaveScheduler.cancelUserCharges(userId);

        // Update subscription
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        await subscription.save();

        res.json({
            success: true,
            message: 'Subscription canceled successfully'
        });

    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error canceling subscription',
            error: error.message
        });
    }
});

module.exports = router;
