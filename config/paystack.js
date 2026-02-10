const Paystack = require('paystack-node');

// Initialize Paystack with secret key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error('⚠️  PAYSTACK_SECRET_KEY not found in environment variables');
    console.error('Please add PAYSTACK_SECRET_KEY to your environment variables');
}

// Initialize Paystack SDK
// The paystack-node package expects the secret key as the first parameter
const environment = process.env.NODE_ENV === 'production' ? 'live' : 'test';
const paystack = new Paystack(PAYSTACK_SECRET_KEY, environment);

console.log('✓ Paystack SDK initialized');

module.exports = paystack;
