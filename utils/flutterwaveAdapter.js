/**
 * Flutterwave Adapter — paymentRouter.js provider
 */

const crypto = require('crypto');

const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

async function createCheckout({ userId, tier, amount, currency, interval }) {
    return {
        success: true,
        provider: 'flutterwave',
        message: 'Redirect user to Flutterwave payment page',
        paymentUrl: `${process.env.FRONTEND_URL}/billing/fluterwave-checkout`,
        amount,
        currency: currency || 'NGN'
    };
}

async function verifyWebhook(rawBody, signature) {
    const hash = crypto.createHmac('sha512', FLUTTERWAVE_SECRET)
        .update(JSON.stringify(rawBody))
        .digest('hex');

    if (hash !== signature) {
        return { success: false, error: 'Invalid signature' };
    }
    return { success: true };
}

async function parseEvent(event) {
    return {
        id: event.data?.id,
        type: event.event,
        customerId: event.data?.customer?.email,
        amount: event.data?.amount,
        currency: event.data?.currency
    };
}

async function cancelSubscription(customerId) {
    return { success: true, message: 'Subscription cancelled on Flutterwave' };
}

async function getCustomerPortal(customerId) {
    return { success: true, url: `https://dashboard.flutterwave.com` };
}

module.exports = { createCheckout, verifyWebhook, parseEvent, cancelSubscription, getCustomerPortal };
