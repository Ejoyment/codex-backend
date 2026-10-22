/**
 * The success page must actively verify the provider redirect; a static page
 * left Paystack trials unactivated after the card was charged.
 */
const fs = require('fs');
const path = require('path');

const PAGE = path.resolve(__dirname, '../buildrs-frontend/pages/payment-success.js');
const source = fs.readFileSync(PAGE, 'utf8');

describe('payment success activation', () => {
  test('reads both Paystack references and the Flutterwave transaction id', () => {
    expect(source).toContain("from 'next/router'");
    expect(source).toContain('useRouter');
    expect(source).toContain('router.query.reference');
    expect(source).toContain('router.query.trxref');
    expect(source).toContain('router.query.transaction_id');
  });

  test('calls the matching verify endpoint before claiming success', () => {
    expect(source).toContain("'/api/paystack-billing/verify'");
    expect(source).toContain("'/api/flutterwave-billing/verify'");
    expect(source).toContain('verifying');
    expect(source).toContain('setStatus(\'error\')');
  });
});
