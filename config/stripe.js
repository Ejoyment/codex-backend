let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn('⚠️  Stripe not configured - STRIPE_SECRET_KEY environment variable is required');

    // Create a mock object when Stripe is not configured
    stripe = {
        checkout: {
            sessions: {
                create: async () => {
                    throw new Error('Stripe not configured. Please set STRIPE_SECRET_KEY environment variable.');
                }
            }
        },
        billingPortal: {
            sessions: {
                create: async () => {
                    throw new Error('Stripe not configured. Please set STRIPE_SECRET_KEY environment variable.');
                }
            }
        },
        webhooks: {
            constructEvent: () => {
                throw new Error('Stripe not configured. Please set STRIPE_SECRET_KEY environment variable.');
            }
        }
    };
}

// Price IDs for each tier (you'll need to create these in Stripe Dashboard)
const PRICE_IDS = {
    pro_monthly: process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
    pro_plus_monthly: process.env.STRIPE_PRO_PLUS_PRICE_ID,
    pro_plus_yearly: process.env.STRIPE_PRO_PLUS_YEARLY_PRICE_ID,
    team_standard_monthly: process.env.STRIPE_TEAM_STANDARD_PRICE_ID,
    team_standard_yearly: process.env.STRIPE_TEAM_STANDARD_YEARLY_PRICE_ID,
    team_premium_monthly: process.env.STRIPE_TEAM_PREMIUM_PRICE_ID,
    team_premium_yearly: process.env.STRIPE_TEAM_PREMIUM_YEARLY_PRICE_ID,
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID
};

// Create a checkout session
async function createCheckoutSession(userId, email, tier, interval = 'monthly') {
    try {
        const priceKey = tier === 'enterprise' ? 'enterprise' : `${tier}_${interval}`;
        const priceId = PRICE_IDS[priceKey];
        if (!priceId) {
            return { success: false, error: `No Stripe price configured for ${tier} (${interval})` };
        }

        const session = await stripe.checkout.sessions.create({
            customer_email: email,
            client_reference_id: userId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/pricing.html?canceled=true`,
            metadata: {
                userId: userId,
                tier: tier,
                interval: interval
            }
        });

        return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return { success: false, error: error.message };
    }
}

// Create a customer portal session
async function createPortalSession(customerId) {
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.FRONTEND_URL}/settings.html`,
        });

        return { success: true, url: session.url };
    } catch (error) {
        console.error('Portal session error:', error);
        return { success: false, error: error.message };
    }
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature) {
    try {
        const event = stripe.webhooks.constructEvent(
            payload,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
        return { success: true, event };
    } catch (error) {
        console.error('Webhook signature verification failed:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    stripe,
    createCheckoutSession,
    createPortalSession,
    verifyWebhookSignature,
    PRICE_IDS
};
