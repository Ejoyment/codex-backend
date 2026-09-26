/**
 * paymentRouter.js — Multi-Rail Payment Router
 * 
 * Routes payment processing through the appropriate provider based on
 * user country and currency:
 * - Paystack: NGN, GHS, KES, ZAR (African markets)
 * - Flutterwave: Wider pan-African coverage
 * - Stripe: USD / International cards
 * 
 * All providers share a common adapter interface:
 * - createCheckout()
 * - verifyWebhook()
 * - cancelSubscription()
 * - getCustomerPortal()
 */

const Subscription = require('../models/Subscription');
const Entitlement = require('../server/models/EntitlementModel');

// Provider adapters
const paystackAdapter = require('./paystackAdapter');
const flutterwaveAdapter = require('./flutterwaveAdapter');
const stripeAdapter = require('./stripeAdapter');

const providers = {
    stripe: stripeAdapter,
    paystack: paystackAdapter,
    flutterwave: flutterwaveAdapter
};

/**
 * Select the appropriate payment provider based on country and currency
 */
function selectProvider(country, currency) {
    const africanCountries = ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'MW', 'RW', 'BF', 'SN', 'CM', 'CI', 'ML', 'TD', 'CG', 'GA', 'GQ', 'GW', 'LR', 'NE', 'SL', 'GM', 'GW'];
    const africanCurrencies = ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'MWK', 'RWF', 'BIF', 'XOF', 'XAF', 'GNF', 'LRD', 'SLL', 'MZN'];

    if (africanCountries.includes(country) || africanCurrencies.includes(currency)) {
        if (['NG', 'GH', 'KE', 'ZA'].includes(country)) return 'paystack';
        return 'flutterwave';
    }
    return 'stripe';
}

/**
 * Create a checkout session on the chosen payment rail
 */
async function createCheckout(userId, tier, interval, country, currency) {
    const provider = selectProvider(country, currency);
    const adapter = providers[provider];

    if (!adapter) {
        throw new Error(`Unsupported payment provider: ${provider}`);
    }

    const subscription = await Subscription.findOne({ userId });
    if (!subscription) {
        throw new Error('User not found');
    }

    const tierPricing = {
        developer: { amount: 0, currency: 'USD' },
        pro: { amount: 20, currency },
        pro_plus: { amount: 60, currency },
        team_standard: { amount: 40, currency },
        team_premium: { amount: 120, currency },
        enterprise: null // custom pricing
    };

    const pricing = tierPricing[tier];
    if (pricing === null) {
        throw new Error('Enterprise requires custom pricing negotiation');
    }

    const result = await adapter.createCheckout({
        userId,
        tier,
        amount: pricing.amount,
        currency: pricing.currency,
        interval: interval || 'monthly',
        customerId: subscription.customerId,
        metadata: { tier, interval, provider }
    });

    // Create entitlement record
    await Entitlement.create({
        userId,
        plan: tier,
        provider,
        status: 'pending',
        currency,
        country,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    return result;
}

/**
 * Verify a webhook from the specified provider
 */
async function verifyWebhook(provider, rawBody, signature) {
    const adapter = providers[provider];
    if (!adapter) {
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
    return adapter.verifyWebhook(rawBody, signature);
}

/**
 * Process verified webhook event and update entitlement
 */
async function processWebhook(provider, event) {
    const adapter = providers[provider];
    const result = await adapter.parseEvent(event);

    const entitlement = await Entitlement.findOne({ providerRef: result.customerId });
    if (!entitlement) {
        throw new Error('Entitlement not found');
    }

    switch (event.type) {
        case 'checkout.session.completed':
        case 'charge.success':
        case 'invoice.payment_succeeded':
            entitlement.status = 'active';
            entitlement.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            entitlement.lastEventId = event.id;
            entitlement.status = 'active';
            break;

        case 'invoice.payment_failed':
        case 'customer.subscription.deleted':
            entitlement.failedPayments = (entitlement.failedPayments || 0) + 1;
            entitlement.status = 'past_due';
            entitlement.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            break;

        case 'invoice.payment_action_required':
            entitlement.status = 'past_due';
            break;
    }

    await entitlement.save();

    // Update subscription
    if (entitlement.userId) {
        const subscription = await Subscription.findOne({ userId: entitlement.userId });
        if (subscription) {
            subscription.tier = entitlement.plan;
            subscription.status = entitlement.status === 'active' ? 'active' : 'past_due';
            subscription.paymentProvider = provider;
            subscription.paymentId = result.subscriptionId;
            subscription.customerId = result.customerId;
            await subscription.save();
        }
    }

    return { success: true, entitlement };
}

/**
 * Cancel subscription on the selected provider
 */
async function cancelSubscription(userId) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) throw new Error('Subscription not found');

    const provider = subscription.paymentProvider || 'stripe';
    const adapter = providers[provider];
    const result = await adapter.cancelSubscription(subscription.customerId);

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.status = 'cancelled';
    await subscription.save();

    return result;
}

/**
 * Get customer portal for the user's provider
 */
async function getCustomerPortal(userId) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) throw new Error('Subscription not found');

    const provider = subscription.paymentProvider || 'stripe';
    const adapter = providers[provider];
    return adapter.getCustomerPortal(subscription.customerId);
}

/**
 * Get entitlement for a user
 */
async function getEntitlement(userId) {
    return Entitlement.findOne({ userId }).populate('teamId');
}

module.exports = {
    createCheckout,
    verifyWebhook,
    processWebhook,
    cancelSubscription,
    getCustomerPortal,
    getEntitlement,
    selectProvider,
    providers
};
