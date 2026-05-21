const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { createCheckoutSession, createPortalSession, verifyWebhookSignature, stripe } = require('../config/stripe');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

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
router.get('/current', verifyToken, async (req, res) => {
    try {
        let subscription = await Subscription.findOne({ userId: req.userId });
        
        // Create default subscription if none exists
        if (!subscription) {
            subscription = new Subscription({
                userId: req.userId,
                tier: 'freebie',
                status: 'active'
            });
            await subscription.save();
        }

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
            subscription: {
                tier: subscription.tier,
                status: subscription.status,
                features: enabledFeatures, // Return as array
                featuresObj: subscription.features, // Also return object for compatibility
                pricing: `$${subscription.pricing.amount}/${subscription.pricing.interval}`,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                trialEndsAt: subscription.trialEndsAt
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

// Create Stripe checkout session
router.post('/create-checkout', verifyToken, async (req, res) => {
    try {
        const { tier, interval } = req.body;

        if (!['professional', 'enterprise'].includes(tier)) {
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

// Upgrade subscription (manual or after payment)
router.post('/upgrade', verifyToken, async (req, res) => {
    try {
        const { tier, paymentProvider, paymentId, customerId, metadata } = req.body;

        if (!['professional', 'enterprise'].includes(tier)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tier. Must be professional or enterprise'
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

        // Set end date (30 days from now for professional)
        if (tier === 'professional') {
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

// Cancel subscription
router.post('/cancel', verifyToken, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ userId: req.userId });
        
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No subscription found'
            });
        }

        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        
        // Downgrade to freebie tier
        subscription.upgradeTo('freebie');
        
        await subscription.save();

        res.json({
            success: true,
            message: 'Subscription cancelled successfully',
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
            message: 'Error cancelling subscription'
        });
    }
});

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
        subscription.upgradeTo('freebie');
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

// Create customer portal session
router.post('/portal', verifyToken, async (req, res) => {
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

// Stripe webhook handler
router.post('/payment/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // In production, verify Stripe signature
        const event = req.body;

        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                // Update subscription based on payment
                await handleSuccessfulPayment(session.customer, session.metadata);
                break;
            
            case 'customer.subscription.deleted':
                const subscription = event.data.object;
                await handleCancelledSubscription(subscription.customer);
                break;
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(400).json({ success: false });
    }
});

// Paystack webhook handler
router.post('/payment/paystack', async (req, res) => {
    try {
        const event = req.body;

        if (event.event === 'charge.success') {
            const { customer, metadata } = event.data;
            await handleSuccessfulPayment(customer.customer_code, metadata);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Paystack webhook error:', error);
        res.status(400).json({ success: false });
    }
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
            subscription.upgradeTo('freebie');
            await subscription.save();
        }
    } catch (error) {
        console.error('Handle cancellation error:', error);
    }
}

module.exports = router;
