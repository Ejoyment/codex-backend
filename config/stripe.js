const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Price IDs for each tier (you'll need to create these in Stripe Dashboard)
const PRICE_IDS = {
    professional_monthly: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    professional_yearly: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID
};

// Create a checkout session
async function createCheckoutSession(userId, email, tier, interval = 'monthly') {
    try {
        const priceId = interval === 'yearly' 
            ? PRICE_IDS.professional_yearly 
            : PRICE_IDS.professional_monthly;

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
