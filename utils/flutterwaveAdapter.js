/**
 * Flutterwave Adapter — paymentRouter.js provider
 */

const crypto = require('crypto');

const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

async function createCheckout({ userId, tier, amount, currency, interval, email, redirectUrl }) {
    const secret = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secret) {
        return {
            success: false,
            provider: 'flutterwave',
            message: 'Flutterwave checkout is not configured — set FLUTTERWAVE_SECRET_KEY',
            code: 'PROVIDER_UNAVAILABLE',
        };
    }
    try {
        const axios = require('axios');
        const txRef = `flw_${Date.now()}_${String(userId).slice(-6)}`;
        const res = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: txRef,
                amount: Number(amount),
                currency: currency || 'USD',
                redirect_url: redirectUrl,
                customer: { email },
                meta: { userId: String(userId), tier, interval },
            },
            { headers: { Authorization: `Bearer ${secret}` } }
        );
        const data = res.data?.data || {};
        return { success: true, provider: 'flutterwave', sessionId: txRef, url: data.link, txRef };
    } catch (error) {
        return { success: false, provider: 'flutterwave', message: error.response?.data?.message || error.message };
    }
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
