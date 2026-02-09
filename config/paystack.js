const Paystack = require('paystack-node');

// Initialize Paystack with secret key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.warn('⚠️  PAYSTACK_SECRET_KEY not found in environment variables');
}

const paystack = new Paystack(PAYSTACK_SECRET_KEY, process.env.NODE_ENV);

module.exports = paystack;
