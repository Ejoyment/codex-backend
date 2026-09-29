/**
 * Stripe Adapter — paymentRouter.js provider
 */

const { stripe } = require('../config/stripe');

/**
 * NOTE: config/stripe.js exports { stripe, createCheckoutSession, ... }.
 * Requiring the module itself and calling stripe.checkout.sessions.create()
 * threw a TypeError, so checkout was structurally broken.
 */
function requireStripe() {
    if (!stripe || typeof stripe.checkout?.sessions?.create !== 'function') {
        throw new Error('Stripe client is not initialized — check STRIPE_SECRET_KEY.');
    }
    return stripe;
}

async function createCheckout({ userId, tier, amount, currency, interval, customerId, metadata }) {
    const client = requireStripe();
    const session = await client.checkout.sessions.create({
        // Only pass `customer` when we actually have one; Stripe rejects the
        // key outright when it is undefined.
        ...(customerId ? { customer: customerId } : { customer_email: undefined }),
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{
            price_data: {
                product_data: { name: `BuildrsHQ ${tier}` },
                unit_amount: Math.round(amount * 100),
                currency: currency || 'usd',
                recurring: { interval: interval || 'month' }
            },
            quantity: 1
        }],
        metadata: { tier, userId, interval: interval || 'monthly', ...(metadata || {}) },
        success_url: `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`
    });

    return { success: true, sessionId: session.id, url: session.url };
}

async function verifyWebhook(rawBody, signature) {
    const endpoint = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpoint) {
        return { success: false, error: 'STRIPE_WEBHOOK_SECRET is not configured' };
    }
    if (!signature) {
        return { success: false, error: 'Missing stripe-signature header' };
    }
    try {
        const event = requireStripe().webhooks.constructEvent(rawBody, signature, endpoint);
        return { success: true, event };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function parseEvent(event) {
    const object = (event && event.data && event.data.object) || {};
    return {
        id: event.id,
        type: event.type,
        customerId: object.customer,
        subscriptionId: object.subscription,
        amount: object.amount,
        currency: object.currency
    };
}

async function cancelSubscription(customerId) {
    if (!customerId) {
        return { success: false, error: 'customerId is required' };
    }
    const client = requireStripe();
    // `customer` was not in scope here (the parameter is customerId), so this
    // threw ReferenceError and cancellation never worked.
    const subscriptions = await client.subscriptions.list({ customer: customerId, limit: 1 });
    if (subscriptions.data.length > 0) {
        await client.subscriptions.cancel(subscriptions.data[0].id);
        return { success: true, cancelled: subscriptions.data[0].id };
    }
    return { success: true, cancelled: null };
}

async function getCustomerPortal(customerId) {
    if (!customerId) {
        return { success: false, error: 'customerId is required' };
    }
    const portalSession = await requireStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL}/settings/billing`
    });
    return { success: true, url: portalSession.url };
}

module.exports = { createCheckout, verifyWebhook, parseEvent, cancelSubscription, getCustomerPortal };
