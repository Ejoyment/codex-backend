const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const BillingScheduler = require('../utils/billingScheduler');

/**
 * @swagger
 * /api/trial-billing/setup-payment:
 *   post:
 *     summary: Setup payment method for trial
 *     tags:
 *       - Trial Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: Stripe payment method ID
 *     responses:
 *       200:
 *         description: Payment method setup successful
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.post('/setup-payment', authenticateToken, async (req, res) => {
    try {
        const { paymentMethodId } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create or get Stripe customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.fullName,
                metadata: {
                    userId: userId.toString()
                }
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId
            }
        });

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
                paymentId: paymentMethodId,
                paymentProvider: 'stripe',
                pricing: {
                    amount: 25,
                    currency: 'USD',
                    interval: 'monthly'
                }
            });
        } else {
            subscription.isTrialWithCard = true;
            subscription.cardAddedAt = cardAddedAt;
            subscription.customerId = customerId;
            subscription.paymentId = paymentMethodId;
            subscription.status = 'trial';
            subscription.tier = 'professional';
            subscription.trialEndsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));
        }

        // Enable professional features during trial
        subscription.upgradeTo('professional');
        await subscription.save();

        // Schedule first charge (210 seconds from now)
        await BillingScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt);

        res.json({
            success: true,
            message: 'Payment method added successfully',
            subscription: {
                status: subscription.status,
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt,
                firstChargeAt: new Date(cardAddedAt.getTime() + (210 * 1000))
            }
        });

    } catch (error) {
        console.error('Setup payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting up payment method',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/trial-billing/status:
 *   get:
 *     summary: Get billing status
 *     tags:
 *       - Trial Billing
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
                amount: subscription.pricing.amount
            },
            pendingCharges: pendingCharges.map(c => ({
                type: c.chargeType,
                scheduledFor: c.scheduledFor,
                amount: c.amount / 100
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
 * /api/trial-billing/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags:
 *       - Trial Billing
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

/**
 * @swagger
 * /api/trial-billing/setup-intent:
 *   get:
 *     summary: Create Stripe setup intent for collecting card details
 *     tags:
 *       - Trial Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Setup intent created
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get('/setup-intent', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create or get Stripe customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.fullName,
                metadata: {
                    userId: userId.toString()
                }
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // Create setup intent
        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            payment_method_types: ['card']
        });

        res.json({
            success: true,
            clientSecret: setupIntent.client_secret
        });

    } catch (error) {
        console.error('Create setup intent error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating setup intent',
            error: error.message
        });
    }
});

module.exports = router;
