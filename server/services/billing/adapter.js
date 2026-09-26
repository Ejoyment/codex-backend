/**
 * Phase 3 — Payment provider adapter interface.
 * Every adapter implements: createCheckout(), verifyWebhook(),
 * cancelSubscription(), getCustomerPortal().
 */

class PaymentAdapter {
  get name() {
    throw new Error('Not implemented');
  }
  async createCheckout() {
    throw new Error('Not implemented');
  }
  async verifyWebhook() {
    throw new Error('Not implemented');
  }
  async cancelSubscription() {
    throw new Error('Not implemented');
  }
  async getCustomerPortal() {
    throw new Error('Not implemented');
  }
}

module.exports = { PaymentAdapter };
