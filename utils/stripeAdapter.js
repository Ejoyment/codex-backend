/**
 * Stripe Adapter — paymentRouter.js provider
 */

const stripe = require('../config/stripe');

async function createCheckout({ userId, tier, amount, currency, interval, customerId, metadata }) {
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{
            price_data: {
                product_data: { name: `BuildrsHQ ${tier}`, },
                unit_amount: Math.round(amount * 100),
                currency: currency || 'usd',
                recurring: { interval: interval || 'month' }
            },
            quantity: 1
        }],
        metadata: { tier, userId, interval: interval || 'monthly' },
        success_url: `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`
    });

    return { success: true, sessionId: session.id, url: session.url };
}

async function verifyWebhook(rawBody, signature) {
    const sig = signature;
    const endpoint = process.env.STRIPE_WEBHOOK_SECRET;
    try {
        const event = stripe.webhooks.constructEvent(rawBody, sig, endpoint);
        return { success: true, event };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function parseEvent(event) {
    return {
        id: event.id,
        type: event.type,
        customerId: event.data.object.customer,
        subscriptionId: event.data.object.subscription,
        amount: event.data.object.amount,
        currency: event.data.object.currency
    };
}

async function cancelSubscription(customerId) {
    const subscription = await stripe.subscriptions.list({ customer, limit: 1 });
    if (subscription.data.length > 0) {
        await stripe.subscriptions.cancel(subscription.data[0].id);
    }
    return { success: true };
}

async function getCustomerPortal(customerId) {
    const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL}/settings/billing`
    });
    return { success: true, url: portalSession.url };
}

module.exports = { createCheckout, verifyWebhook, parseEvent, cancelSubscription, getCustomerPortal };
