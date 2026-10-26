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

  async createCheckout({ userId, email, plan = 'pro', interval = 'monthly', successUrl, cancelUrl }) {
    const stripe = this._client();
    const priceMap = {
      pro_monthly: process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PROFESSIONAL_PRICE_ID,
      pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
      pro_plus_monthly: process.env.STRIPE_PRO_PLUS_PRICE_ID,
      pro_plus_yearly: process.env.STRIPE_PRO_PLUS_YEARLY_PRICE_ID,
      team_standard_monthly: process.env.STRIPE_TEAM_STANDARD_PRICE_ID,
      team_standard_yearly: process.env.STRIPE_TEAM_STANDARD_YEARLY_PRICE_ID,
      team_premium_monthly: process.env.STRIPE_TEAM_PREMIUM_PRICE_ID,
      team_premium_yearly: process.env.STRIPE_TEAM_PREMIUM_YEARLY_PRICE_ID,
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    };
    const price = priceMap[plan === 'enterprise' ? 'enterprise' : `${plan}_${interval}`];
    if (!price) throw new Error('Unknown plan/price for Stripe checkout');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: String(userId), plan, interval },
    });
    return { provider: 'stripe', sessionId: session.id, url: session.url };
  }

  // Returns normalized { eventId, type, userId, plan, status, customerId, subscriptionId, currency }
  async verifyWebhook({ rawBody, signature }) {
    const stripe = this._client();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    const obj = event.data?.object || {};
    const amountMinor = stripeAmountMinor(obj);
    return {
      eventId: `stripe:${event.id}`,
      type: event.type,
      userId: obj.metadata?.userId || obj.client_reference_id || null,
      plan: obj.metadata?.plan || null,
      interval: obj.metadata?.interval || stripeInterval(obj),
      status: mapStripeStatus(event.type, obj),
      customerId: obj.customer || null,
      subscriptionId: obj.subscription || obj.id || null,
      currency: obj.currency ? String(obj.currency).toUpperCase() : null,
      amountMinor,
      amount: amountMinor == null ? null : amountMinor / 100,
    };
  }

  async cancelSubscription({ subscriptionId, atPeriodEnd = true }) {
    const stripe = this._client();
    const sub = atPeriodEnd
      ? await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
      : await stripe.subscriptions.cancel(subscriptionId);
    return {
      provider: 'stripe',
      id: sub.id,
      status: sub.status,
      cancelAtPeriodEnd: atPeriodEnd,
    };
  }

  async getCustomerPortal({ customerId, returnUrl }) {
    const stripe = this._client();
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { provider: 'stripe', url: session.url };
  }
}

function stripeAmountMinor(obj) {
  // Prefer pre-tax/subtotal values so Stripe Tax does not make a legitimate
  // charge fail canonical price validation.
  const values = [
    obj.amount_subtotal,
    obj.subtotal,
    obj.items?.data?.[0]?.price?.unit_amount,
    obj.amount_total,
    obj.amount_paid,
    obj.amount_due,
    obj.amount,
  ];
  for (const value of values) {
    if (value != null && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return null;
}

function stripeInterval(obj) {
  const interval = obj.metadata?.interval || obj.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year') return 'yearly';
  if (interval === 'month') return 'monthly';
  return interval || null;
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
  // Money-back-out events deactivate via the dunning state (recoverable if
  // reversed; exact policy wording is a team decision — see 3.2).
  if (type === 'charge.refunded') return 'past_due';
  if (type === 'charge.dispute.created') return 'past_due';
  return null;
}

module.exports = { StripeAdapter };
