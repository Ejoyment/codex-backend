const crypto = require('crypto');
const { PaymentAdapter } = require('../adapter');

/**
 * Stripe adapter (USD / international).
 */
class StripeAdapter extends PaymentAdapter {
  get name() {
    return 'stripe';
  }

  _client() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Stripe not configured');
    return require('stripe')(key);
  }

  async createCheckout({ userId, email, plan = 'professional', interval = 'monthly', successUrl, cancelUrl }) {
    const stripe = this._client();
    const priceMap = {
      professional_monthly: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
      professional_yearly: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    };
    const price = priceMap[plan === 'enterprise' ? 'enterprise' : `professional_${interval}`];
    if (!price) throw new Error('Unknown plan/price for Stripe checkout');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: String(userId), plan },
    });
    return { provider: 'stripe', sessionId: session.id, url: session.url };
  }

  // Returns normalized { eventId, type, userId, plan, status, customerId, subscriptionId, currency }
  async verifyWebhook({ rawBody, signature }) {
    const stripe = this._client();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    const obj = event.data?.object || {};
    return {
      eventId: `stripe:${event.id}`,
      type: event.type,
      userId: obj.metadata?.userId || obj.client_reference_id || null,
      plan: obj.metadata?.plan || null,
      status: mapStripeStatus(event.type, obj),
      customerId: obj.customer || null,
      subscriptionId: obj.subscription || obj.id || null,
      currency: (obj.currency || 'USD').toUpperCase(),
    };
  }

  async cancelSubscription({ subscriptionId }) {
    const stripe = this._client();
    const sub = await stripe.subscriptions.cancel(subscriptionId);
    return { provider: 'stripe', id: sub.id, status: sub.status };
  }

  async getCustomerPortal({ customerId, returnUrl }) {
    const stripe = this._client();
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { provider: 'stripe', url: session.url };
  }
}

function mapStripeStatus(type, obj) {
  if (type === 'checkout.session.completed') return 'active';
  if (type === 'customer.subscription.updated') {
    if (obj.status === 'active' || obj.status === 'trialing') return obj.status === 'trialing' ? 'trial' : 'active';
    if (obj.status === 'past_due') return 'past_due';
    if (obj.status === 'canceled') return 'cancelled';
  }
  if (type === 'customer.subscription.deleted') return 'cancelled';
  if (type === 'invoice.payment_failed') return 'past_due';
  return null;
}

module.exports = { StripeAdapter };
