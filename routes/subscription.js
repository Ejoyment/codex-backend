const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Subscription = require('../models/Subscription');
const Entitlement = require('../server/models/EntitlementModel');
const User = require('../models/User');
const { createCheckoutSession, createPortalSession, verifyWebhookSignature, stripe } = require('../config/stripe');
const { requireVerifiedWebhook } = require('../utils/webhookSecurity');
const paymentRouter = require('../utils/paymentRouter');
const { authenticateToken } = require('../middleware/auth');
const { TIERS, canonicalTier } = require('../utils/tierNames');
const { getOrCreateSubscription } = require('../middleware/trial');
const {
    applyPendingChanges,
    describeState,
    currentPeriodEnd,
    planDirection,
    DAY_MS,
    FREE_TIER,
} = require('../utils/subscriptionLifecycle');

// Tiers that can be purchased (everything except the free developer tier)
const PAID_TIERS = TIERS.filter((t) => t !== 'developer');

/**
 * Load a user's subscription, applying any due scheduled change first.
 *
 * Every billing endpoint goes through here so a cancellation or downgrade
 * scheduled for "end of period" takes effect the moment the period ends,
 * without needing a background job to run on time.
 */
async function loadSubscription(userId) {
    let subscription = await Subscription.findOne({ userId });
    if (!subscription) return null;
    if (applyPendingChanges(subscription)) {
        await subscription.save();
    }
    return subscription;
}

/**
 * @swagger
 * /api/subscription/current:
 *   get:
 *     summary: Get user's current subscription
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 subscription:
 *                   $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Unauthorized
 */
// Get current subscription
router.get('/current', authenticateToken, async (req, res) => {
    try {
        const subscription = await getOrCreateSubscription(req.userId);
        if (applyPendingChanges(subscription)) await subscription.save();

        // Convert features object to array of enabled features
        const enabledFeatures = [];
        if (subscription.features) {
            Object.keys(subscription.features).forEach(key => {
                if (subscription.features[key] === true) {
                    enabledFeatures.push(key);
                }
            });
        }

        res.json({
            success: true,
            // `state` is the shape the billing UI renders. The legacy fields
            // below are kept so existing consumers (auth store, dashboard)
            // keep working during the transition.
            state: describeState(subscription),
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                features: enabledFeatures, // Return as array
                featuresObj: subscription.features, // Also return object for compatibility
                pricing: `$${subscription.pricing.amount}/${subscription.pricing.interval}`,
                startDate: subscription.startDate,
                endDate: currentPeriodEnd(subscription),
                trialEndsAt: subscription.trialEndsAt,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                pendingTier: subscription.pendingTier,
                changeEffectiveAt: subscription.changeEffectiveAt,
                cancelledAt: subscription.cancelledAt,
                paymentProvider: subscription.paymentProvider
            }
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscription'
        });
    }
});

/**
 * @swagger
 * /api/subscription/create-checkout:
 *   post:
 *     summary: Create a Stripe checkout session for subscription upgrade
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tier
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [professional, enterprise]
 *                 example: professional
 *               interval:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 example: monthly
 *     responses:
 *       200:
 *         description: Checkout session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessionId:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: Invalid tier
 *       401:
 *         description: Unauthorized
 */
// Create Stripe checkout session
router.post('/create-checkout', authenticateToken, async (req, res) => {
    try {
        const { tier, interval } = req.body;

        if (!PAID_TIERS.includes(tier)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tier'
            });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // For enterprise, redirect to contact sales
        if (tier === 'enterprise') {
            return res.json({
                success: true,
                contactSales: true,
                message: 'Please contact sales for enterprise pricing'
            });
        }

        // Create Stripe checkout session
        const result = await createCheckoutSession(
            req.userId,
            user.email,
            tier,
            interval || 'monthly'
        );

        if (result.success) {
            res.json({
                success: true,
                sessionId: result.sessionId,
                url: result.url
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('Checkout creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating checkout session'
        });
    }
});

/**
 * @swagger
 * /api/subscription/tier-checkout:
 *   post:
 *     summary: Create checkout session with multi-rail payment
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tier]
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [developer, pro, pro_plus, team_standard, team_premium, enterprise]
 *               interval:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               country:
 *                 type: string
 *                 example: NG
 *               currency:
 *                 type: string
 *                 example: NGN
 *               teamSize:
 *                 type: number
 *                 example: 5
 *     responses:
 *       200:
 *         description: Checkout session created with selected payment rail
 *       400:
 *         description: Invalid tier
 *       401:
 *         description: Unauthorized
 */
// Multi-rail tier checkout
router.post('/tier-checkout', authenticateToken, async (req, res) => {
    try {
        const { tier, interval = 'monthly', country, currency, teamSize = 1 } = req.body;
        const validTiers = ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ success: false, message: 'Invalid tier' });
        }
        const result = await paymentRouter.createCheckout(req.userId, tier, interval, country || 'US', currency || 'USD');
        res.json(result);
    } catch (error) {
        console.error('Tier checkout error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @swagger
 * /api/subscription/entitlement:
 *   get:
 *     summary: Get user's current entitlement and credit usage
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Entitlement details
 *       401:
 *         description: Unauthorized
 */
// Get entitlement with credit usage
router.get('/entitlement', authenticateToken, async (req, res) => {
    try {
        const entitlement = await Entitlement.findOne({ userId: req.userId });
        const subscription = await Subscription.findOne({ userId: req.userId });
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }
        const creditPool = await subscription.getRemainingCredits();
        const compute = await subscription.getRemainingCompute();
        res.json({
            success: true,
            tier: subscription.tier,
            entitlement: entitlement ? {
                plan: entitlement.plan,
                provider: entitlement.provider,
                status: entitlement.status,
                currentPeriodEnd: entitlement.currentPeriodEnd,
                creditsRemaining: entitlement.creditsRemaining,
                lastEventId: entitlement.lastEventId
            } : null,
            creditPool,
            compute,
            maxConcurrentJobs: subscription.getMaxConcurrentAgentJobs(),
            maxDebugRooms: subscription.getMaxDebugHostRooms(),
            maxDeployments: subscription.getMaxActiveDeployments(),
            specEngineLevel: subscription.getSpecEngineLevel(),
            webrtcEnabled: subscription.isWebRTCEnabled()
        });
    } catch (error) {
        console.error('Entitlement error:', error);
        res.status(500).json({ success: false, message: 'Error fetching entitlement' });
    }
});

/**
 * @swagger
 * /api/subscription/upgrade:
 *   post:
 *     summary: Upgrade subscription tier
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tier
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [professional, enterprise]
 *               paymentProvider:
 *                 type: string
 *                 example: stripe
 *               paymentId:
 *                 type: string
 *               customerId:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Subscription upgraded successfully
 *       400:
 *         description: Invalid tier
 *       401:
 *         description: Unauthorized
 */
// Upgrade subscription (manual or after payment)
router.post('/upgrade', authenticateToken, async (req, res) => {
    try {
        const { tier, paymentProvider, paymentId, customerId, metadata } = req.body;

        if (!PAID_TIERS.includes(tier)) {
            return res.status(400).json({
                success: false,
                message: `Invalid tier. Must be one of: ${PAID_TIERS.join(', ')}`
            });
        }

        let subscription = await Subscription.findOne({ userId: req.userId });
        
        if (!subscription) {
            subscription = new Subscription({ userId: req.userId });
        }

        // Upgrade to new tier
        subscription.upgradeTo(tier);
        subscription.status = 'active';
        subscription.paymentProvider = paymentProvider || 'manual';
        subscription.paymentId = paymentId;
        subscription.customerId = customerId;
        
        if (metadata) {
            subscription.metadata = { ...subscription.metadata, ...metadata };
        }

        // Set end date (30 days from now for paid tiers; enterprise is custom)
        if (tier !== 'enterprise') {
            subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        await subscription.save();

        res.json({
            success: true,
            message: `Successfully upgraded to ${tier} tier`,
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                features: subscription.features,
                pricing: subscription.pricing
            }
        });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({
            success: false,
            message: 'Error upgrading subscription'
        });
    }
});

/**
 * @swagger
 * /api/subscription/cancel:
 *   post:
 *     summary: Cancel current subscription
 *     description: >
 *       Defaults to a graceful period-end cancellation for paid plans: the user
 *       keeps their entitlements until `changeEffectiveAt`, then drops to the
 *       free developer tier automatically. Trialing and already-expired plans
 *       are cancelled immediately, since there is no paid period to protect.
 *       Pass `mode=immediate` to revoke access straight away.
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [period_end, immediate]
 *     responses:
 *       200:
 *         description: Cancellation scheduled or applied
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No subscription found
 */
// Cancel subscription
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const subscription = await loadSubscription(req.userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No subscription found'
            });
        }

        const state = describeState(subscription);
        const requestedMode = req.body && req.body.mode;

        if (requestedMode === 'immediate') {
            // Drop to Free right now and stop all future billing.
            subscription.cancelAtPeriodEnd = false;
            subscription.pendingTier = undefined;
            subscription.changeEffectiveAt = undefined;
            subscription.cancelledAt = new Date();
            if (subscription.tier !== FREE_TIER) subscription.upgradeTo(FREE_TIER);
            subscription.status = 'cancelled';
        } else {
            subscription.cancelledAt = new Date();
            // Already on Free (or a trial that has ended): there is nothing to
            // keep alive, so cancellation is immediate regardless of request.
            if (state.cancelIsImmediate) {
                subscription.cancelAtPeriodEnd = false;
                subscription.pendingTier = undefined;
                subscription.changeEffectiveAt = undefined;
                if (subscription.tier !== FREE_TIER) subscription.upgradeTo(FREE_TIER);
                subscription.status = 'cancelled';
            } else {
                // Keep paying-for entitlements until the period runs out.
                subscription.cancelAtPeriodEnd = true;
                subscription.pendingTier = undefined;
                subscription.changeEffectiveAt = currentPeriodEnd(subscription);
                subscription.status = 'active';
            }
        }

        await subscription.save();

        const next = describeState(subscription);
        res.json({
            success: true,
            message: next.hasPendingChange
                ? `Subscription will end on ${next.changeEffectiveAt.toISOString().slice(0, 10)}`
                : 'Subscription cancelled',
            state: next,
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                cancelledAt: subscription.cancelledAt,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                changeEffectiveAt: subscription.changeEffectiveAt
            }
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling subscription'
        });
    }
});

/**
 * @swagger
 * /api/subscription/resume:
 *   post:
 *     summary: Undo a scheduled cancellation or downgrade
 *     description: >
 *       Clears `cancelAtPeriodEnd` and `pendingTier`, keeping the current plan
 *       and its renewal date. No-op if nothing is scheduled.
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled change cleared
 *       404:
 *         description: No subscription found
 */
router.post('/resume', authenticateToken, async (req, res) => {
    try {
        const subscription = await loadSubscription(req.userId);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        const hadPending = Boolean(subscription.cancelAtPeriodEnd || subscription.pendingTier);
        if (hadPending) {
            subscription.cancelAtPeriodEnd = false;
            subscription.pendingTier = undefined;
            subscription.changeEffectiveAt = undefined;
            // A cancelled-but-not-yet-ended plan resumes as a normal active plan.
            if (subscription.status === 'cancelled' && subscription.tier !== FREE_TIER) {
                subscription.status = 'active';
            }
            await subscription.save();
        }

        res.json({
            success: true,
            message: hadPending ? 'Your plan will continue as scheduled' : 'Nothing to resume',
            state: describeState(subscription),
        });
    } catch (error) {
        console.error('Resume subscription error:', error);
        res.status(500).json({ success: false, message: 'Error resuming subscription' });
    }
});

/**
 * @swagger
 * /api/subscription/change-plan:
 *   post:
 *     summary: Schedule a plan change
 *     description: >
 *       Upgrades are not applied here — they require payment and are redirected
 *       to checkout. This endpoint handles downgrades and switching to the free
 *       plan, which take effect at the end of the paid period so the user keeps
 *       what they already paid for. Trialing users are downgraded immediately.
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tier]
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [developer, pro, pro_plus, team_standard, team_premium]
 *               timing:
 *                 type: string
 *                 enum: [now, period_end]
 *     responses:
 *       200:
 *         description: Plan change applied or scheduled
 *       400:
 *         description: Invalid tier or not a downgrade
 *       404:
 *         description: No subscription found
 */
router.post('/change-plan', authenticateToken, async (req, res) => {
    try {
        const subscription = await loadSubscription(req.userId);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No subscription found' });
        }

        const requestedTier = canonicalTier(req.body && req.body.tier);
        if (!TIERS.includes(requestedTier)) {
            return res.status(400).json({ success: false, message: 'Invalid tier' });
        }
        if (requestedTier === 'enterprise') {
            return res.status(400).json({
                success: false,
                message: 'Enterprise plans are handled by sales',
            });
        }

        const direction = planDirection(subscription.tier, requestedTier);
        if (direction === 'current') {
            return res.status(400).json({ success: false, message: 'You are already on this plan' });
        }
        if (direction === 'upgrade') {
            // Never grant a paid tier here — that route would be a free upgrade.
            return res.status(400).json({
                success: false,
                requiresCheckout: true,
                message: 'Upgrades require payment. Continue to checkout.',
                tier: requestedTier,
            });
        }

        const state = describeState(subscription);
        const timing = (req.body && req.body.timing) || 'period_end';
        // A trial or an expired plan has no paid period left to protect, so the
        // switch happens now. Anyone mid-period waits until the period ends.
        const applyNow = timing === 'now' || state.cancelIsImmediate;

        if (applyNow) {
            subscription.upgradeTo(requestedTier);
            subscription.cancelAtPeriodEnd = false;
            subscription.pendingTier = undefined;
            subscription.changeEffectiveAt = undefined;
            subscription.cancelledAt = undefined;
            subscription.status = 'active';
        } else {
            subscription.pendingTier = requestedTier;
            subscription.changeEffectiveAt = currentPeriodEnd(subscription);
            // Choosing a replacement plan supersedes a pending cancellation.
            subscription.cancelAtPeriodEnd = false;
            if (!subscription.cancelledAt) subscription.cancelledAt = new Date();
        }

        await subscription.save();

        const next = describeState(subscription);
        res.json({
            success: true,
            message: next.hasPendingChange
                ? `Plan changes to ${next.pendingTier} on ${next.changeEffectiveAt.toISOString().slice(0, 10)}`
                : `Plan changed to ${next.tier}`,
            state: next,
        });
    } catch (error) {
        console.error('Change plan error:', error);
        res.status(500).json({ success: false, message: 'Error changing plan' });
    }
});

/**
 * @swagger
 * /api/subscription/webhook/stripe:
 *   post:
 *     summary: Stripe webhook handler
 *     tags:
 *       - Subscription & Billing
 *     description: Receives Stripe webhook events. Requires raw body and Stripe-Signature header.
 *     parameters:
 *       - name: stripe-signature
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Signature verification failed
 */
// Stripe webhook handler (MUST be before express.json() middleware)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    
    const verification = verifyWebhookSignature(req.body, signature);
    
    if (!verification.success) {
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    const event = verification.event;

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;
            
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
            
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// Handle successful checkout
async function handleCheckoutCompleted(session) {
    const userId = session.client_reference_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    const subscription = await Subscription.findOne({ userId });
    if (subscription) {
        subscription.upgradeTo(session.metadata.tier);
        subscription.status = 'active';
        subscription.paymentProvider = 'stripe';
        subscription.customerId = customerId;
        subscription.paymentId = subscriptionId;
        subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await subscription.save();
    }
}

// Handle subscription update
async function handleSubscriptionUpdated(stripeSubscription) {
    const subscription = await Subscription.findOne({ 
        customerId: stripeSubscription.customer 
    });
    
    if (subscription) {
        subscription.status = stripeSubscription.status === 'active' ? 'active' : 'cancelled';
        await subscription.save();
    }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(stripeSubscription) {
    const subscription = await Subscription.findOne({ 
        customerId: stripeSubscription.customer 
    });
    
    if (subscription) {
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.upgradeTo('developer');
        await subscription.save();
    }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
    const subscription = await Subscription.findOne({ 
        customerId: invoice.customer 
    });
    
    if (subscription) {
        subscription.status = 'active';
        subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await subscription.save();
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    const subscription = await Subscription.findOne({ 
        customerId: invoice.customer 
    });
    
    if (subscription) {
        subscription.status = 'expired';
        await subscription.save();
    }
}

/**
 * @swagger
 * /api/subscription/portal:
 *   post:
 *     summary: Create Stripe customer portal session
 *     tags:
 *       - Subscription & Billing
 *     security:
 *       - bearerAuth: []
 *     description: Returns a URL to the Stripe billing portal for managing payment methods and invoices
 *     responses:
 *       200:
 *         description: Portal session URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 url:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No Stripe customer found
 */
// Create customer portal session
router.post('/portal', authenticateToken, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ userId: req.userId });
        
        if (!subscription || !subscription.customerId) {
            return res.status(404).json({
                success: false,
                message: 'No Stripe customer found'
            });
        }

        const result = await createPortalSession(subscription.customerId);
        
        if (result.success) {
            res.json({
                success: true,
                url: result.url
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('Portal session error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating portal session'
        });
    }
});

/**
 * @swagger
 * /api/subscription/payment/stripe:
 *   post:
 *     summary: Stripe payment webhook (legacy)
 *     tags:
 *       - Subscription & Billing
 *     description: Legacy Stripe webhook endpoint
 *     responses:
 *       200:
 *         description: Webhook received
 */
// Stripe webhook handler.
// The signature is verified before any subscription state is touched. Without
// this check the endpoint is a public "activate any subscription" primitive:
// anyone could POST a fabricated checkout.session.completed and grant a paid
// tier to any customer, or customer.subscription.deleted and downgrade a
// paying customer.
router.post('/payment/stripe', requireVerifiedWebhook('stripe', async (req, res) => {
    const event = req.verifiedWebhookEvent;

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            await handleSuccessfulPayment(session.customer, session.metadata);
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            await handleCancelledSubscription(subscription.customer);
            break;
        }

        default:
            break;
    }

    res.json({ received: true });
}), async (req, res, next) => {
    // requireVerifiedWebhook already responded on verification failure.
    if (res.headersSent) return;
    next();
});

/**
 * @swagger
 * /api/subscription/payment/paystack:
 *   post:
 *     summary: Paystack payment webhook
 *     tags:
 *       - Subscription & Billing
 *     description: Receives Paystack charge.success events to activate subscriptions
 *     responses:
 *       200:
 *         description: Webhook received
 */
// Paystack webhook handler.
// Signature-verified for the same reason as the Stripe route above. This one
// previously had no verification at all, so a single unauthenticated POST
// granted a free 30-day subscription to any customer code.
router.post('/payment/paystack', requireVerifiedWebhook('paystack', async (req, res) => {
    const event = req.verifiedWebhookEvent;

    if (event.event === 'charge.success') {
        const { customer, metadata } = event.data;
        if (customer && customer.customer_code) {
            await handleSuccessfulPayment(customer.customer_code, metadata);
        }
    }

    res.json({ success: true });
}), async (req, res, next) => {
    if (res.headersSent) return;
    next();
});

// Helper function to handle successful payment
async function handleSuccessfulPayment(customerId, metadata) {
    try {
        const subscription = await Subscription.findOne({ customerId });
        if (subscription) {
            subscription.status = 'active';
            subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await subscription.save();
        }
    } catch (error) {
        console.error('Handle payment error:', error);
    }
}

// Helper function to handle cancelled subscription
async function handleCancelledSubscription(customerId) {
    try {
        const subscription = await Subscription.findOne({ customerId });
        if (subscription) {
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date();
            subscription.upgradeTo('developer');
            await subscription.save();
        }
    } catch (error) {
        console.error('Handle cancellation error:', error);
    }
}

module.exports = router;
