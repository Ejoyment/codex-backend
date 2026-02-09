const express = require('express');
const router = express.Router();
const paystack = require('../config/paystack');
const { authenticateToken } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const BillingScheduler = require('../utils/paystackScheduler');

/**
 * Initialize payment (get authorization URL)
 * POST /api/paystack-billing/initialize
 */
router.post('/initialize', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Amount in kobo (₦10,000 = 1,000,000 kobo)
        const amount = 1000000; // ₦10,000 (~$25 USD)

        // Initialize transaction
        const response = await paystack.transaction.initialize({
            email: user.email,
            amount: amount,
            currency: 'NGN',
            callback_url: `${process.env.FRONTEND_URL}/payment-success.html`,
            metadata: {
                userId: userId.toString(),
                fullName: user.fullName,
                custom_fields: [
                    {
                        display_name: 'User ID',
                        variable_name: 'user_id',
                        value: userId.toString()
                    }
                ]
            }
        });

        if (response.status) {
            res.json({
                success: true,
                authorizationUrl: response.data.authorization_url,
                reference: response.data.reference,
                accessCode: response.data.access_code
            });
        } else {
            throw new Error(response.message || 'Failed to initialize payment');
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
 * Verify payment and setup subscription
 * POST /api/paystack-billing/verify
 */
router.post('/verify', authenticateToken, async (req, res) => {
    try {
        const { reference } = req.body;
        const userId = req.user.userId;

        if (!reference) {
            return res.status(400).json({ success: false, message: 'Payment reference required' });
        }

        // Verify transaction
        const response = await paystack.transaction.verify({ reference });

        if (!response.status || response.data.status !== 'success') {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get or create customer
        let customerId = user.paystackCustomerId;
        if (!customerId) {
            const customerResponse = await paystack.customer.create({
                email: user.email,
                first_name: user.fullName.split(' ')[0],
                last_name: user.fullName.split(' ').slice(1).join(' ') || user.fullName.split(' ')[0]
            });

            if (customerResponse.status) {
                customerId = customerResponse.data.customer_code;
                user.paystackCustomerId = customerId;
                await user.save();
            }
        }

        // Get authorization code from transaction
        const authorizationCode = response.data.authorization.authorization_code;

        // Create or update subscription
        let subscription = await Subscription.findOne({ userId });
        const cardAddedAt = new Date();

        if (!subscription) {
            subscription = new Subscription({
                userId,
                tier: 'professional',
                status: 'trial',
                isTrialWithCard: true,
                cardAddedAt,
                trialEndsAt: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)), // 14 days
                customerId,
                paymentId: authorizationCode,
                paymentProvider: 'paystack',
                pricing: {
                    amount: 10000, // ₦10,000
                    currency: 'NGN',
                    interval: 'monthly'
                }
            });
        } else {
            subscription.isTrialWithCard = true;
            subscription.cardAddedAt = cardAddedAt;
            subscription.customerId = customerId;
            subscription.paymentId = authorizationCode;
            subscription.status = 'trial';
            subscription.tier = 'professional';
            subscription.trialEndsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));
            subscription.paymentProvider = 'paystack';
        }

        // Enable professional features during trial
        subscription.upgradeTo('professional');
        await subscription.save();

        // Schedule first charge (210 seconds from now)
        await BillingScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt);

        res.json({
            success: true,
            message: 'Payment verified successfully',
            subscription: {
                status: subscription.status,
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt,
                firstChargeAt: new Date(cardAddedAt.getTime() + (210 * 1000))
            }
        });

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
 * Get billing status
 * GET /api/paystack-billing/status
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
                amount: c.amount / 100,
                currency: 'NGN'
            })),
            recentCharges: completedCharges.map(c => ({
                type: c.chargeType,
                completedAt: c.completedAt,
                amount: c.amount / 100,
                currency: 'NGN'
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
 * Cancel subscription
 * POST /api/paystack-billing/cancel
 */
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        // Cancel all pending charges
        await BillingScheduler.cancelUserCharges(userId);

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
