const express = require('express');
const { sendInternalError } = require('../utils/httpErrors');
const router = express.Router();
const paystack = require('../config/paystack');
const { authenticateToken } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const BillingScheduler = require('../utils/paystackScheduler');
const { notifyPaymentEvent } = require('../utils/notificationTriggers');
const { requireVerifiedWebhook } = require('../utils/webhookSecurity');
const { planAmount } = require('../utils/billingPricing');

/**
 * Activate a 14-day card-backed trial from a verified Paystack verification
 * charge. Shared by /verify (client redirect) and the charge.success webhook
 * (server-to-server fallback when the user closes the tab).
 */
async function activateTrialWithAuthorization({ userId, authorizationCode, customerId }) {
    const user = await User.findById(userId);
    if (!user) return null;

    let subscription = await Subscription.findOne({ userId });
    if (subscription && subscription.paymentId === authorizationCode &&
        ['trial', 'active'].includes(subscription.status)) {
        return subscription;
    }

    const cardAddedAt = new Date();
    if (!subscription) {
        subscription = new Subscription({
            userId,
            tier: 'pro',
            status: 'trial',
            isTrialWithCard: true,
            cardAddedAt,
            trialEndsAt: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)), // 14 days
            customerId,
            paymentId: authorizationCode,
            paymentProvider: 'paystack',
            pricing: {
                amount: planAmount('pro'),
                currency: 'USD',
                interval: 'monthly'
            }
        });
    } else {
        subscription.isTrialWithCard = true;
        subscription.cardAddedAt = cardAddedAt;
        subscription.customerId = customerId;
        subscription.paymentId = authorizationCode;
        subscription.status = 'trial';
        subscription.tier = 'pro';
        subscription.trialEndsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));
        subscription.paymentProvider = 'paystack';
    }

    // Enable pro-tier features during trial
    subscription.upgradeTo('pro');
    await subscription.save();

    // Schedule first charge when the 14-day trial ends
    await BillingScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt, subscription.tier);

    return subscription;
}

/**
 * @swagger
 * /api/paystack-billing/initialize:
 *   post:
 *     summary: Initialize Paystack payment (get authorization URL)
 *     tags:
 *       - Paystack Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.post('/initialize', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user.userId || req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            console.error('User not found for ID:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const frontendUrl = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
        if (!frontendUrl) {
            return res.status(503).json({ success: false, message: 'Payment provider is not configured yet.' });
        }

        // Amount in cents ($0.50 = 50 cents for card verification)
        // This is the verification charge amount
        const amount = 50; // $0.50 verification charge

        // Initialize transaction
        const response = await paystack.transaction.initialize({
            email: user.email,
            amount: amount,
            currency: 'USD',
            callback_url: `${frontendUrl}/payment-success`,
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
        return sendInternalError(req, res, error, { message: 'Error initializing payment' });
    }
});

/**
 * @swagger
 * /api/paystack-billing/verify:
 *   post:
 *     summary: Verify Paystack payment and setup subscription
 *     tags:
 *       - Paystack Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reference:
 *                 type: string
 *                 description: Payment reference from Paystack
 *     responses:
 *       200:
 *         description: Payment verified and subscription created
 *       400:
 *         description: Payment verification failed
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
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
        const data = response.data || {};

        if (!response.status || data.status !== 'success') {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // The reference must belong to the authenticated account and be the
        // $0.50 card-verification charge. Without this, any successful
        // reference could be replayed to activate a trial on another account.
        if (String((data.metadata && data.metadata.userId) || '') !== String(userId)) {
            return res.status(403).json({
                success: false,
                message: 'This transaction does not belong to this account'
            });
        }
        if (Number(data.amount) !== 50 || String(data.currency || '').toUpperCase() !== 'USD') {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const authorizationCode = data.authorization && data.authorization.authorization_code;
        if (!authorizationCode) {
            return res.status(400).json({
                success: false,
                message: 'Payment did not return a reusable authorization code'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Idempotent replay: this authorization code already has a trial.
        let subscription = await Subscription.findOne({ userId });
        if (subscription && subscription.paymentId === authorizationCode &&
            ['trial', 'active'].includes(subscription.status)) {
            return res.json({
                success: true,
                message: 'Payment already verified',
                subscription: {
                    status: subscription.status,
                    tier: subscription.tier,
                    trialEndsAt: subscription.trialEndsAt
                }
            });
        }

        // Get or create customer
        let customerId = user.paystackCustomerId;
        if (!customerId) {
            const name = String(user.fullName || user.email || 'Customer').trim();
            const parts = name.split(' ').filter(Boolean);
            const customerResponse = await paystack.customer.create({
                email: user.email,
                first_name: parts[0] || 'Customer',
                last_name: parts.slice(1).join(' ') || parts[0] || 'Customer'
            });

            if (customerResponse.status) {
                customerId = customerResponse.data.customer_code;
                user.paystackCustomerId = customerId;
                await user.save();
            }
        }

        subscription = await activateTrialWithAuthorization({
            userId,
            authorizationCode,
            customerId,
        });
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            message: 'Payment verified successfully',
            subscription: {
                status: subscription.status,
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt,
                firstChargeAt: subscription.trialEndsAt
            }
        });

    } catch (error) {
        console.error('Verify payment error:', error);
        return sendInternalError(req, res, error, { message: 'Error verifying payment' });
    }
});

/**
 * @swagger
 * /api/paystack-billing/status:
 *   get:
 *     summary: Get Paystack billing status
 *     tags:
 *       - Paystack Billing
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
                currency: 'USD'
            })),
            recentCharges: completedCharges.map(c => ({
                type: c.chargeType,
                completedAt: c.completedAt,
                amount: c.amount / 100,
                currency: 'USD'
            }))
        });

    } catch (error) {
        console.error('Get billing status error:', error);
        return sendInternalError(req, res, error, { message: 'Error fetching billing status' });
    }
});

/**
 * @swagger
 * /api/paystack-billing/cancel:
 *   post:
 *     summary: Cancel Paystack subscription
 *     tags:
 *       - Paystack Billing
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
        const userId = req.userId || req.user.userId || req.user.id;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        // Cancel all pending charges
        await BillingScheduler.cancelUserCharges(userId);

        // Downgrade to developer (free) tier (NO REFUND)
        subscription.upgradeTo('developer');
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        
        // Clear payment info
        subscription.isTrialWithCard = false;
        subscription.firstChargeCompleted = false;
        subscription.billingCycle = 0;
        subscription.nextBillingDate = null;
        
        await subscription.save();

        console.log(`✓ Subscription cancelled for user ${userId}, downgraded to developer (free) tier`);

        res.json({
            success: true,
            message: 'Subscription cancelled successfully. You have been downgraded to the Free tier.',
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                cancelledAt: subscription.cancelledAt
            }
        });

    } catch (error) {
        console.error('Cancel subscription error:', error);
        return sendInternalError(req, res, error, { message: 'Error canceling subscription' });
    }
});

/**
 * @swagger
 * /api/paystack-billing/webhook:
 *   post:
 *     summary: Paystack webhook endpoint for payment notifications
 *     tags:
 *       - Paystack Billing
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 */
router.post('/webhook', requireVerifiedWebhook('paystack', async (req, res) => {
    const event = req.verifiedWebhookEvent;
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
}));

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

        // Verification charge: the client may never return to the success
        // page, so activate the trial here as a server-to-server fallback.
        if (data.metadata?.isVerification) {
            if (Number(data.amount) !== 50 ||
                String(data.currency || '').toUpperCase() !== 'USD') {
                console.log('Ignoring verification charge with unexpected amount/currency');
                return;
            }
            const authorizationCode = data.authorization && data.authorization.authorization_code;
            if (!authorizationCode) {
                console.log('Verification charge has no reusable authorization code');
                return;
            }
            await activateTrialWithAuthorization({
                userId,
                authorizationCode,
                customerId: data.customer && data.customer.customer_code,
            });
            return;
        }

        notifyPaymentEvent({
            type: 'payment_succeeded',
            userId,
            detail: `Payment received (ref ${reference}). Your subscription is active.`,
            data: { reference, provider: 'paystack' },
        });

        // Only a charge that matches the subscription's price may clear
        // past_due; a stray or partial charge must not reactivate billing.
        const subscription = await Subscription.findOne({ userId });
        if (subscription && subscription.status === 'past_due') {
            const expectedAmount = Math.round((subscription.pricing?.amount || 0) * 100);
            const expectedCurrency = String(subscription.pricing?.currency || 'USD').toUpperCase();
            if (Number(data.amount) !== expectedAmount ||
                String(data.currency || '').toUpperCase() !== expectedCurrency) {
                console.log('Ignoring charge that does not match subscription pricing');
                return;
            }
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

        notifyPaymentEvent({
            type: 'payment_failed',
            userId,
            detail: `A charge failed (ref ${reference}). Please update your payment method.`,
            data: { reference, provider: 'paystack' },
        });

        // Failed charges enter a grace state; only an explicit cancellation
        // downgrades the tier or revokes the card, matching Flutterwave.
        const subscription = await Subscription.findOne({ userId });
        if (subscription && subscription.status !== 'past_due') {
            subscription.status = 'past_due';
            await subscription.save();

            console.log(`✗ Payment failed for user ${userId}, marked past_due`);
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
            // Downgrade to developer (free) tier (NO REFUND)
            subscription.upgradeTo('developer');
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date();
            subscription.isTrialWithCard = false;
            subscription.firstChargeCompleted = false;
            subscription.billingCycle = 0;
            subscription.nextBillingDate = null;
            await subscription.save();
            
            console.log(`✓ Subscription cancelled for user ${subscription.userId}, downgraded to developer (free) tier`);
        }

    } catch (error) {
        console.error('Error handling subscription disabled:', error);
    }
}

module.exports = router;
