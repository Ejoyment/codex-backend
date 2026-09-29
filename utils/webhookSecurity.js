/**
 * Webhook signature verification helpers.
 *
 * Every payment webhook in this codebase must prove it came from the payment
 * provider before it is allowed to mutate subscription state. An unverified
 * webhook endpoint is a public "activate any subscription" or "cancel any
 * customer" primitive: anyone can POST a crafted event and mint themselves a
 * paid tier, or downgrade a paying customer.
 *
 * Rules enforced here:
 *   1. A secret must be configured (fail closed if it is not).
 *   2. The signature is checked over the RAW request bytes. Re-serializing the
 *      parsed body is fragile: key order or whitespace differences produce a
 *      different HMAC than the provider computed.
 *   3. Comparisons are constant-time to avoid leaking the signature a byte at
 *      a time.
 */

const crypto = require('crypto');

/**
 * Paths whose raw bytes must be preserved for signature verification.
 * Must stay in sync with `captureWebhookRawBody` in
 * server/services/securityHeaders.js.
 */
const WEBHOOK_PATH_MARKERS = [
    '/api/v1/billing/webhook',
    '/api/subscription/payment/stripe',
    '/api/subscription/payment/paystack',
    '/api/paystack-billing/webhook',
    '/api/flutterwave-billing/webhook',
];

function isWebhookPath(url) {
    if (!url) return false;
    return WEBHOOK_PATH_MARKERS.some((marker) => url.includes(marker));
}

/**
 * Raw request bytes captured by the express.json() `verify` hook.
 * Falls back to re-serialization only when the hook did not run for this
 * path, so a misconfigured mount fails the signature check rather than
 * silently passing an unverified payload.
 */
function getRawBody(req) {
    if (Buffer.isBuffer(req.rawBody)) {
        return req.rawBody;
    }
    if (req.rawBody !== undefined && req.rawBody !== null) {
        return Buffer.from(String(req.rawBody));
    }
    return Buffer.from(JSON.stringify(req.body === undefined ? {} : req.body));
}

function safeEquals(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) {
        // Still burn a comparison so length isn't a fast-path oracle.
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Stripe webhook event using STRIPE_WEBHOOK_SECRET.
 * Returns { verified, event, reason }.
 */
function verifyStripe(req, { secret = process.env.STRIPE_WEBHOOK_SECRET } = {}) {
    if (!secret) {
        return { verified: false, reason: 'STRIPE_WEBHOOK_SECRET is not configured' };
    }
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        return { verified: false, reason: 'Missing stripe-signature header' };
    }

    const stripeModule = require('stripe');
    let event;
    try {
        event = stripeModule(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
            getRawBody(req),
            signature,
            secret
        );
    } catch (error) {
        return { verified: false, reason: error.message };
    }
    return { verified: true, event };
}

/**
 * Verify a Paystack webhook using an HMAC-SHA512 of the raw body keyed by
 * PAYSTACK_SECRET_KEY, sent as x-paystack-signature.
 */
function verifyPaystack(req, { secret = process.env.PAYSTACK_SECRET_KEY } = {}) {
    if (!secret) {
        return { verified: false, reason: 'PAYSTACK_SECRET_KEY is not configured' };
    }
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
        return { verified: false, reason: 'Missing x-paystack-signature header' };
    }
    const expected = crypto
        .createHmac('sha512', secret)
        .update(getRawBody(req))
        .digest('hex');
    if (!safeEquals(expected, signature)) {
        return { verified: false, reason: 'Invalid x-paystack-signature' };
    }
    return { verified: true, event: req.body };
}

/**
 * Verify a Flutterwave webhook using the FLW- signature header, which is a
 * simple secret comparison rather than an HMAC.
 */
function verifyFlutterwave(req, { secret = process.env.FLUTTERWAVE_WEBHOOK_HASH } = {}) {
    if (!secret) {
        return { verified: false, reason: 'FLUTTERWAVE_WEBHOOK_HASH is not configured' };
    }
    const signature = req.headers['flw-signature'];
    if (!signature) {
        return { verified: false, reason: 'Missing flw-signature header' };
    }
    if (!safeEquals(secret, signature)) {
        return { verified: false, reason: 'Invalid flw-signature' };
    }
    return { verified: true, event: req.body };
}

/**
 * Express handler wrapper that rejects unverified webhooks with 400 and never
 * lets a verification failure fall through to business logic.
 *
 * Usage:
 *   router.post('/payment/stripe', requireVerifiedWebhook('stripe'), handler)
 */
function requireVerifiedWebhook(provider, handler) {
    const verifiers = {
        stripe: verifyStripe,
        paystack: verifyPaystack,
        flutterwave: verifyFlutterwave,
    };
    const verify = verifiers[provider];
    if (!verify) {
        throw new Error(`requireVerifiedWebhook: unknown provider "${provider}"`);
    }

    return async function verifiedWebhookHandler(req, res, next) {
        const { verified, event, reason } = verify(req);
        if (!verified) {
            console.error(`[webhook:${provider}] rejected: ${reason}`);
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }
        req.verifiedWebhookEvent = event;
        try {
            await handler(req, res, next);
        } catch (error) {
            console.error(`[webhook:${provider}] handler error:`, error);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Webhook processing failed' });
            }
        }
    };
}

module.exports = {
    isWebhookPath,
    getRawBody,
    safeEquals,
    verifyStripe,
    verifyPaystack,
    verifyFlutterwave,
    requireVerifiedWebhook,
};
