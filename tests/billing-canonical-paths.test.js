const fs = require('fs');
const path = require('path');
const { isWebhookPath } = require('../utils/webhookSecurity');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('canonical billing migration facade', () => {
  test('mounts every frontend billing surface under /api/v1/billing', () => {
    const server = read('server.js');
    expect(server).toContain("app.use('/api/v1/billing/subscription', subscriptionRoutes)");
    expect(server).toContain("app.use('/api/v1/billing/trial', trialBillingRoutes)");
    expect(server).toContain("app.use('/api/v1/billing/paystack', paystackBillingRoutes)");
    expect(server).toContain("app.use('/api/v1/billing/flutterwave', flutterwaveBillingRoutes)");
  });

  test('frontend no longer calls legacy billing URL prefixes', () => {
    const files = [
      'buildrs-frontend/lib/api.js',
      'buildrs-frontend/pages/checkout.js',
      'buildrs-frontend/pages/payment-success.js',
    ];
    const legacyPrefix = /\/api\/(subscription|trial-billing|paystack-billing|flutterwave-billing)\//;

    for (const file of files) {
      expect({ file, legacy: legacyPrefix.test(read(file)) }).toEqual({ file, legacy: false });
    }
  });

  test('canonical provider aliases preserve raw webhook bytes', () => {
    expect(isWebhookPath('/api/v1/billing/paystack/webhook')).toBe(true);
    expect(isWebhookPath('/api/v1/billing/flutterwave/webhook')).toBe(true);
    expect(isWebhookPath('/api/v1/billing/subscription/webhook/stripe')).toBe(true);
    expect(isWebhookPath('/api/v1/billing/subscription/payment/stripe')).toBe(true);
    expect(isWebhookPath('/api/v1/billing/trial/status')).toBe(false);
  });
});
