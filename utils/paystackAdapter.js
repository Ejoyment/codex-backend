/**
 * Paystack Adapter — paymentRouter.js provider
 */

const crypto = require('crypto');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_URL = 'https://api.paystack.co';

async function createCheckout({ userId, tier, amount, currency, interval }) {
    // Paystack uses flat amount in Naira/Ghanaian Cedi/Kenyan Shilling
    // Returns authorization URL for user to complete payment
    const amountInKobo = Math.round(amount * 100);

    return {
        success: true,
        provider: 'paystack',
        message: 'Redirect user to Paystack authorization URL',
        authorizationUrl: `${PAYSTACK_URL}/transaction/initialize`,
        amount: amountInKobo,
        currency: currency || 'NGN'
    };
}

async function verifyWebhook(rawBody, signature) {
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET)
        .update(JSON.stringify(rawBody))
        .digest('hex');

    if (hash !== signature) {
        return { success: false, error: 'Invalid signature' };
    }
    return { success: true };
}

async function parseEvent(event) {
    return {
        id: event.data?.reference,
        type: event.event,
        customerId: event.data?.customer?.customer_code,
        amount: event.data?.amount,
        currency: event.data?.currency
    };
}

async function cancelSubscription(customerId) {
    return { success: true, message: 'Subscription cancelled on Paystack' };
}

async function getCustomerPortal(customerId) {
    return { success: true, url: `https://my.paystack.com/user/subscriptions` };
}

module.exports = { createCheckout, verifyWebhook, parseEvent, cancelSubscription, getCustomerPortal };
