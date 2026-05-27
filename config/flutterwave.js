const Flutterwave = require('flutterwave-node-v3');

let flw = null;

// Only initialize Flutterwave if environment variables are present
if (process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY) {
    flw = new Flutterwave(
        process.env.FLUTTERWAVE_PUBLIC_KEY,
        process.env.FLUTTERWAVE_SECRET_KEY
    );
    console.log('✓ Flutterwave SDK initialized');
} else {
    console.warn('⚠️  Flutterwave not configured - FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables are required');
    console.warn('   Flutterwave billing endpoints will not work without proper configuration');
}

// Create a mock/stub object when Flutterwave is not configured
if (!flw) {
    flw = {
        Payment: {
            initialize: async () => {
                throw new Error('Flutterwave not configured. Please set FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables.');
            }
        },
        Transaction: {
            verify: async () => {
                throw new Error('Flutterwave not configured. Please set FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables.');
            }
        }
    };
}

module.exports = flw;
