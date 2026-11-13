const express = require('express');
const { sendInternalError } = require('../utils/httpErrors');
const router = express.Router();
const flw = require('../config/flutterwave');
const { authenticateToken } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const FlutterwaveScheduler = require('../utils/flutterwaveScheduler');
const { requireVerifiedWebhook } = require('../utils/webhookSecurity');
const { PAID_TIERS, planAmount } = require('../utils/billingPricing');

// Billing plans and prices are server-side only. The client may choose WHICH
// plan to buy, but never how much it costs.
function resolveCheckoutPlan(body = {}) {
    const tier = body.plan || 'pro';
    if (!PAID_TIERS.has(tier)) return null;
    return { tier, amount: planAmount(tier), currency: 'USD' };
}

function transactionBelongsToUser(data, userId) {
    const metaUserId = data.meta && data.meta.userId;
    if (metaUserId && String(metaUserId) === String(userId)) return true;
    // Legacy checkouts put the id at the end of `txref_<timestamp>_<userId>`.
    return Boolean(data.tx_ref) && String(data.tx_ref).endsWith(`_${userId}`);
}

/**
 * Activate a 14-day card-backed trial for a paid Flutterwave charge and
 * schedule the first tokenized charge. Shared by /verify (client redirect) and
 * /webhook (server-to-server), which previously could drift apart.
 */
async function activateTrialSubscription({ userId, user, cardToken, customerId, amount, currency, plan }) {
    const cardAddedAt = new Date();
    const tier = PAID_TIERS.has(plan) ? plan : 'pro';
    const priceAmount = planAmount(tier);

    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
        subscription = new Subscription({
            userId,
            tier,
            status: 'trial',
            isTrialWithCard: true,
            cardAddedAt,
            trialEndsAt: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)), // 14 days
            customerId,
            paymentId: cardToken,
            paymentProvider: 'flutterwave',
            email: user.email,
            pricing: {
                amount: priceAmount,
                currency: currency || 'USD',
                interval: 'monthly'
            }
        });
    } else {
        subscription.isTrialWithCard = true;
        subscription.cardAddedAt = cardAddedAt;
        subscription.customerId = customerId;
        subscription.paymentId = cardToken;
        subscription.status = 'trial';
        subscription.tier = tier;
        subscription.email = user.email;
        subscription.paymentProvider = 'flutterwave';
        subscription.trialEndsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));
    }

    // Enable paid features during the trial
    subscription.upgradeTo(tier);
    await subscription.save();

    // Schedule first charge when the 14-day trial ends
    await FlutterwaveScheduler.scheduleFirstCharge(userId, subscription._id, cardAddedAt, tier);

    return subscription;
}

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
        // Check if Flutterwave is configured (direct REST needs only the secret key)
        if (!process.env.FLUTTERWAVE_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Flutterwave payment service is not configured',
                error: 'Please set FLUTTERWAVE_SECRET_KEY environment variable'
            });
        }

        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const checkout = resolveCheckoutPlan(req.body || {});
        if (!checkout) {
            return res.status(400).json({
                success: false,
                message: 'Unknown or unsupported plan'
            });
        }
        const { tier: plan, amount: price, currency } = checkout;

        // Create payment payload
        const payload = {
            tx_ref: `txref_${Date.now()}_${userId}`,
            amount: price,
            currency,
            redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/payment-success`,
            customer: {
                email: user.email,
                name: user.fullName,
            },
            customizations: {
                title: 'BuildrsHQ Subscription',
                description: '14-day trial with card',
                logo: 'https://your-logo-url.com/logo.png',
            },
            payment_options: 'card,banktransfer,ussd',
            meta: {
                userId: String(userId),
                plan: plan || 'pro',
            },
        };

        const response = await flw.Payment.initialize(payload);

        if (response.status === 'success') {
            const link = response.data.link;
            // `data.link` matches the checkout page contract; `paymentLink` is
            // kept for existing clients/tests.
            res.json({
                success: true,
                data: { link },
                paymentLink: link,
                reference: payload.tx_ref
            });
        } else {
            throw new Error(response.message || 'Payment initialization failed');
        }

    } catch (error) {
        console.error('Initialize payment error:', error);
        return sendInternalError(req, res, error, { message: 'Error initializing payment' });
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
        // Check if Flutterwave is configured (direct REST needs only the secret key)
        if (!process.env.FLUTTERWAVE_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Flutterwave payment service is not configured',
                error: 'Please set FLUTTERWAVE_SECRET_KEY environment variable'
            });
        }

        const { transaction_id } = req.body;
        const userId = req.user.userId;

        if (!transaction_id) {
            return res.status(400).json({ success: false, message: 'Transaction ID required' });
        }

        // Verify transaction with Flutterwave
        const response = await flw.Transaction.verify({ id: transaction_id });
        const data = response.data || {};
        const plan = data.meta && data.meta.plan;

        if (!PAID_TIERS.has(plan)) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const expectedAmount = planAmount(plan);
        const currency = String(data.currency || '').toUpperCase();
        const amountMatches = Number(data.amount) === expectedAmount;

        if (data.status !== 'successful' || !amountMatches || currency !== 'USD') {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        if (!transactionBelongsToUser(data, userId)) {
            return res.status(403).json({
                success: false,
                message: 'This transaction does not belong to this account'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Card token is required for the trial: it is the only way to charge
        // the saved card after the trial ends.
        const cardToken = data.card && data.card.token;
        if (!cardToken) {
            return res.status(400).json({
                success: false,
                message: 'Payment did not return a reusable card token'
            });
        }
        const customerId = data.customer && data.customer.id;

        // Idempotent replay: the same card token already has an active trial.
        const existing = await Subscription.findOne({ userId });
        if (existing && existing.paymentId === cardToken &&
            ['trial', 'active'].includes(existing.status)) {
            return res.json({
                success: true,
                message: 'Payment already verified',
                subscription: {
                    status: existing.status,
                    tier: existing.tier,
                    trialEndsAt: existing.trialEndsAt
                }
            });
        }

        const subscription = await activateTrialSubscription({
            userId,
            user,
            cardToken,
            customerId,
            amount: expectedAmount,
            currency,
            plan,
        });

        res.json({
            success: true,
            message: 'Payment verified successfully',
            subscription: {
                status: subscription.status,
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt
            }
        });

    } catch (error) {
        console.error('Verify payment error:', error);
        return sendInternalError(req, res, error, { message: 'Error verifying payment' });
    }
});

/**
 * @swagger
 * /api/flutterwave-billing/webhook:
 *   post:
 *     summary: Flutterwave server-to-server webhook (verif-hash verified)
 *     tags:
 *       - Flutterwave Billing
 *     responses:
 *       200:
 *         description: Event acknowledged
 *       400:
 *         description: Invalid signature
 */
// Server-to-server webhook: this is the only activation path that fires
// without the user returning to the app. Raw bytes are captured by the
// express.json verify hook (see utils/webhookSecurity WEBHOOK_PATH_MARKERS).
router.post('/webhook', requireVerifiedWebhook('flutterwave', async (req, res) => {
    const event = req.body || {};
    const data = event.data || {};

    // Only completed, successful charges activate a subscription.
    if (data.status !== 'successful') {
        return res.json({ success: true, ignored: true, reason: `status:${data.status || 'unknown'}` });
    }

    // Resolve the user from meta (preferred) or the tx_ref format
    // `txref_<timestamp>_<userId>`.
    let userId = data.meta && data.meta.userId;
    if (!userId && data.tx_ref) {
        const parts = String(data.tx_ref).split('_');
        userId = parts[2];
    }
    if (!userId) {
        return res.json({ success: true, ignored: true, reason: 'no user reference' });
    }

    const user = await User.findById(userId);
    if (!user) {
        return res.json({ success: true, ignored: true, reason: 'user not found' });
    }

    // Only a checkout that we priced can start a trial. Tokenized recurring
    // charges also emit charge.completed, but carry no plan metadata; they must
    // not reset the subscription back to `trial`.
    const plan = data.meta && data.meta.plan;
    if (!PAID_TIERS.has(plan)) {
        return res.json({ success: true, ignored: true, reason: 'no checkout plan' });
    }
    if (Number(data.amount) !== planAmount(plan) ||
        String(data.currency || '').toUpperCase() !== 'USD') {
        return res.json({ success: true, ignored: true, reason: 'amount or currency mismatch' });
    }

    const cardToken = data.card && data.card.token;
    const customerId = (data.customer && data.customer.id) || user.flutterwaveCustomerId;

    // Idempotency: Flutterwave retries webhooks. If this exact charge was
    // already applied, acknowledge without duplicating the schedule.
    const existing = await Subscription.findOne({ userId });
    if (existing && cardToken && existing.paymentId === cardToken &&
        ['active', 'trial'].includes(existing.status)) {
        return res.json({ success: true, message: 'Already processed' });
    }

    await activateTrialSubscription({
        userId,
        user,
        cardToken,
        customerId,
        amount: data.amount,
        currency: data.currency,
        plan: data.meta && data.meta.plan,
    });

    res.json({ success: true, message: 'Webhook processed' });
}));

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
                amount: c.amount / 100, // Convert cents to dollars
                currency: 'USD'
            })),
            recentCharges: completedCharges.map(c => ({
                type: c.chargeType,
                completedAt: c.completedAt,
                amount: c.amount / 100, // Convert cents to dollars
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

module.exports = router;
