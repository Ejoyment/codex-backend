const crypto = require('crypto');
const { PaymentAdapter } = require('../adapter');

/**
 * Flutterwave adapter (African markets).
 * Docs: https://developer.flutterwave.com/docs/webhooks
 */
class FlutterwaveAdapter extends PaymentAdapter {
  get name() {
    return 'flutterwave';
  }

  _secret() {
    const s = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!s) throw new Error('Flutterwave not configured');
    return s;
  }

  async createCheckout({ userId, email, plan = 'professional', amount, currency = 'NGN', redirectUrl }) {
    const axios = require('axios');
    const txRef = `flw_${Date.now()}_${String(userId).slice(-6)}`;
    const res = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: txRef,
        amount: Number(amount),
        currency,
        redirect_url: redirectUrl,
        customer: { email },
        meta: { userId: String(userId), plan },
      },
      { headers: { Authorization: `Bearer ${this._secret()}` } }
    );
    const data = res.data?.data || {};
    return { provider: 'flutterwave', sessionId: txRef, url: data.link };
  }

  async verifyWebhook({ rawBody, signature }) {
    // Flutterwave signs with `verif-hash` == FLWSECK hash configured in dashboard.
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH || this._secret();
    if (signature !== expected) throw new Error('Invalid Flutterwave signature');
    const event = JSON.parse(rawBody.toString());
    const d = event.data || {};
    const ok = event.event === 'charge.completed' && d.status === 'successful';
    return {
      eventId: `flutterwave:${event.id || d.tx_ref || d.id}`,
      type: event.event,
      userId: d.meta?.userId || d.meta?.user_id || null,
      plan: d.meta?.plan || null,
      status: ok ? 'active' : null,
      customerId: d.customer?.email || d.customer?.id || null,
      subscriptionId: d.tx_ref || String(d.id) || null,
      currency: (d.currency || 'NGN').toUpperCase(),
    };
  }

  async cancelSubscription() {
    return { provider: 'flutterwave', status: 'cancelled' };
  }

  async getCustomerPortal() {
    return { provider: 'flutterwave', url: null, note: 'Flutterwave has no hosted portal; manage in dashboard.' };
  }
}

module.exports = { FlutterwaveAdapter };
