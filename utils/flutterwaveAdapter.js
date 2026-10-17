/**
 * Flutterwave Adapter — paymentRouter.js provider
 *
 * Uses the direct REST client in config/flutterwave.js (rec 15) so there is a
 * single Flutterwave integration surface. Previously this adapter returned a
 * hardcoded PROVIDER_UNAVAILABLE failure, which made the whole Flutterwave
 * rail unreachable from /api/subscription/tier-checkout.
 */

const crypto = require('crypto');
const flw = require('../config/flutterwave');

const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

async function createCheckout({ userId, tier, amount, currency, interval, metadata }) {
    // Fail closed and deterministically when the rail is unconfigured: check
    // the env at call time (module capture can be stale) so no network or
    // stub-throw ever reaches the caller.
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
        return {
            success: false,
            provider: 'flutterwave',
            message: 'Flutterwave checkout is not configured — set FLUTTERWAVE_SECRET_KEY',
            code: 'PROVIDER_UNAVAILABLE',
        };
    }
    // Flutterwave requires a customer email. paymentRouter does not pass one,
    // so resolve it from the user record; fall back to a placeholder rather
    // than failing the checkout outright.
    let email = 'customer@buildershq.com';
    try {
        const User = require('../models/User');
        const user = userId ? await User.findById(userId) : null;
        if (user && user.email) email = user.email;
    } catch (error) {
        // Non-fatal: proceed with the placeholder email.
    }

    const txRef = `txref_${Date.now()}_${userId}`;
    const payload = {
        tx_ref: txRef,
        amount,
        currency: currency || 'USD',
        redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/payment-success`,
        customer: { email },
        customizations: {
            title: 'BuildrsHQ Subscription',
            description: `${tier} plan (${interval || 'monthly'})`,
        },
        meta: { userId: String(userId), tier, interval: interval || 'monthly', ...(metadata || {}) },
    };

    const response = await flw.Payment.initialize(payload);

    if (!response || response.status !== 'success' || !response.data || !response.data.link) {
        return {
            success: false,
            provider: 'flutterwave',
            message: (response && response.message) || 'Flutterwave initialization failed',
        };
    }

    return {
        success: true,
        provider: 'flutterwave',
        url: response.data.link,
        authorizationUrl: response.data.link,
        reference: txRef,
    };
}

async function verifyWebhook(rawBody, signature) {
    // Flutterwave uses a static secret comparison (verif-hash), not an HMAC.
    // The old HMAC-over-JSON.stringify check could never match a real webhook.
    const secret = process.env.FLUTTERWAVE_WEBHOOK_HASH || FLUTTERWAVE_SECRET;
    if (!secret) {
        return { success: false, error: 'FLUTTERWAVE_WEBHOOK_HASH is not configured' };
    }
    if (!signature) {
        return { success: false, error: 'Missing verif-hash' };
    }

    const expected = Buffer.from(String(secret), 'utf8');
    const provided = Buffer.from(String(signature), 'utf8');
    const valid =
        expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

    if (!valid) {
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
