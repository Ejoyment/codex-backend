const crypto = require('crypto');
const { PaymentAdapter } = require('../adapter');

/**
 * Paystack adapter (African markets: NGN/GHS/KES/ZAR).
 * Docs: https://paystack.com/docs/payments/webhooks
 */
class PaystackAdapter extends PaymentAdapter {
  get name() {
    return 'paystack';
  }

  _secret() {
    const s = process.env.PAYSTACK_SECRET_KEY;
    if (!s) throw new Error('Paystack not configured');
    return s;
  }

  async createCheckout({ userId, email, plan = 'professional', amount, currency = 'NGN', callbackUrl }) {
    const axios = require('axios');
    const res = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(Number(amount) * 100), // kobo
        currency,
        callback_url: callbackUrl,
        metadata: { userId: String(userId), plan },
      },
      { headers: { Authorization: `Bearer ${this._secret()}` } }
    );
    const data = res.data?.data || {};
    return { provider: 'paystack', sessionId: data.reference, url: data.authorization_url };
  }

  async verifyWebhook({ rawBody, signature }) {
    const secret = this._secret();
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    if (hash !== signature) throw new Error('Invalid Paystack signature');
    const event = JSON.parse(rawBody.toString());
    const d = event.data || {};
    return {
      eventId: `paystack:${event.id || d.reference}`,
      type: event.event,
      userId: d.metadata?.userId || null,
      plan: d.metadata?.plan || null,
      status: event.event === 'charge.success' ? 'active' : null,
      customerId: d.customer?.customer_code || d.customer?.email || null,
      subscriptionId: d.reference || null,
      currency: (d.currency || 'NGN').toUpperCase(),
    };
  }

  async cancelSubscription() {
    // Paystack uses per-plan subscriptions via API; disabling is a no-op here
    // because access is driven by Entitlement + webhook events.
    return { provider: 'paystack', status: 'cancelled' };
  }

  async getCustomerPortal() {
    return { provider: 'paystack', url: null, note: 'Paystack has no hosted portal; manage in dashboard.' };
  }
}

module.exports = { PaystackAdapter };
