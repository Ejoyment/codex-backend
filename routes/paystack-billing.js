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
        const userId = req.userId || req.user.userId || req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            console.error('User not found for ID:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Amount in kobo (₦100 = 10,000 kobo for card verification)
        // This is the verification charge amount
        const amount = 10000; // ₦100 verification charge

        // Initialize transaction
        const response = await paystack.transaction.initialize({
            email: user.email,
            amount: amount,
            currency: 'NGN',
            callback_url: `${process.env.FRONTEND_URL}/payment-success.html`,
            channels: ['card'], // Only allow card payments
            metadata: {
                userId: userId.toString(),
                fullName: user.fullName,
                isVerification: true, // Mark this as verification charge
                custom_fields: [
                    {
                        display_name: 'User ID',
                        variable_name: 'user_id',
                        value: userId.toString()
                    },
                    {
                        display_name: 'Charge Type',
                        variable_name: 'charge_type',
                        value: 'verification'
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
        const userId = req.userId || req.user.userId || req.user.id;

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
                    amount: 10000, // ₦10,000 monthly subscription
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

        // Schedule first charge (14 days from now - after trial ends)
        await BillingScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt);

        res.json({
            success: true,
            message: 'Payment verified successfully',
            subscription: {
                status: subscription.status,
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt,
                firstChargeAt: new Date(cardAddedAt.getTime() + (14 * 24 * 60 * 60 * 1000)) // 14 days
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
        const userId = req.userId || req.user.userId || req.user.id;
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
        const userId = req.userId || req.user.userId || req.user.id;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        // Cancel all pending charges
        await BillingScheduler.cancelUserCharges(userId);

        // Downgrade to freebie tier (NO REFUND)
        subscription.upgradeTo('freebie');
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        
        // Clear payment info
        subscription.isTrialWithCard = false;
        subscription.firstChargeCompleted = false;
        subscription.billingCycle = 0;
        subscription.nextBillingDate = null;
        
        await subscription.save();

        console.log(`✓ Subscription cancelled for user ${userId}, downgraded to freebie tier`);

        res.json({
            success: true,
            message: 'Subscription canceled successfully. You have been downgraded to the Free tier.',
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                cancelledAt: subscription.cancelledAt
            }
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
 * Webhook endpoint for Paystack notifications
 * POST /api/paystack-billing/webhook
 */
router.post('/webhook', async (req, res) => {
    try {
        const crypto = require('crypto');
        const secret = process.env.PAYSTACK_SECRET_KEY;

        // Verify webhook signature
        const hash = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.error('Invalid webhook signature');
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        const event = req.body;
        console.log('Paystack webhook received:', event.event);

        // Handle different event types
        switch (event.event) {
            case 'charge.success':
                await handleChargeSuccess(event.data);
                break;

            case 'charge.failed':
                await handleChargeFailed(event.data);
                break;

            case 'subscription.create':
                console.log('Subscription created:', event.data.subscription_code);
                break;

            case 'subscription.disable':
                await handleSubscriptionDisabled(event.data);
                break;

            default:
                console.log('Unhandled webhook event:', event.event);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
});

/**
 * Handle successful charge webhook
 */
async function handleChargeSuccess(data) {
    try {
        const reference = data.reference;
        const userId = data.metadata?.userId;

        if (!userId) {
            console.log('No userId in webhook metadata');
            return;
        }

        console.log(`Charge successful for user ${userId}, reference: ${reference}`);

        // Update subscription if needed
        const subscription = await Subscription.findOne({ userId });
        if (subscription && subscription.status === 'past_due') {
            subscription.status = 'active';
            await subscription.save();
            console.log(`Subscription reactivated for user ${userId}`);
        }

    } catch (error) {
        console.error('Error handling charge success:', error);
    }
}

/**
 * Handle failed charge webhook
 */
async function handleChargeFailed(data) {
    try {
        const reference = data.reference;
        const userId = data.metadata?.userId;

        if (!userId) {
            console.log('No userId in webhook metadata');
            return;
        }

        console.log(`Charge failed for user ${userId}, reference: ${reference}`);

        // Update subscription status and downgrade to freebie
        const subscription = await Subscription.findOne({ userId });
        if (subscription) {
            // Downgrade to freebie tier (NO REFUND)
            subscription.upgradeTo('freebie');
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date();
            subscription.isTrialWithCard = false;
            subscription.firstChargeCompleted = false;
            subscription.billingCycle = 0;
            subscription.nextBillingDate = null;
            await subscription.save();
            
            console.log(`✗ Payment failed for user ${userId}, downgraded to freebie tier`);
        }

    } catch (error) {
        console.error('Error handling charge failed:', error);
    }
}

/**
 * Handle subscription disabled webhook
 */
async function handleSubscriptionDisabled(data) {
    try {
        const subscriptionCode = data.subscription_code;
        console.log(`Subscription disabled: ${subscriptionCode}`);

        // Find and cancel subscription
        const subscription = await Subscription.findOne({ 
            paymentId: subscriptionCode 
        });

        if (subscription) {
            // Downgrade to freebie tier (NO REFUND)
            subscription.upgradeTo('freebie');
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date();
            subscription.isTrialWithCard = false;
            subscription.firstChargeCompleted = false;
            subscription.billingCycle = 0;
            subscription.nextBillingDate = null;
            await subscription.save();
            
            console.log(`✓ Subscription cancelled for user ${subscription.userId}, downgraded to freebie tier`);
        }

    } catch (error) {
        console.error('Error handling subscription disabled:', error);
    }
}

module.exports = router;
