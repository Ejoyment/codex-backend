const axios = require('axios');

// Direct Flutterwave REST client (audit rec 15) — replaces flutterwave-node-v3,
// which pins a vulnerable node-forge with no upgrade path. Same call surface
// the routes/scheduler already use (Payment.initialize, Transaction.verify,
// Tokenized.charge), so no caller changes were needed.
//
// Flutterwave API reference: https://developer.flutterwave.com/reference
//   POST /v3/payments                  -> { status, message, data: { link } }
//   GET  /v3/transactions/{id}/verify  -> { status, message, data: { status, ... } }
//   POST /v3/tokenized-charges          -> { status, message, data: { id, ... } }

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

let flw = null;

if (FLUTTERWAVE_SECRET_KEY) {
    // Flutterwave API base URL
    const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

    const flwAPI = axios.create({
        baseURL: FLUTTERWAVE_BASE_URL,
        headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    flw = {
        Payment: {
            initialize: async (data) => {
                try {
                    const response = await flwAPI.post('/payments', data);
                    return response.data;
                } catch (error) {
                    console.error('Flutterwave initialize error:', error.response?.data || error.message);
                    throw error;
                }
            }
        },
        Transaction: {
            verify: async ({ id }) => {
                try {
                    const response = await flwAPI.get(`/transactions/${id}/verify`);
                    return response.data;
                } catch (error) {
                    console.error('Flutterwave verify error:', error.response?.data || error.message);
                    throw error;
                }
            }
        },
        Tokenized: {
            charge: async (data) => {
                try {
                    const response = await flwAPI.post('/tokenized-charges', data);
                    return response.data;
                } catch (error) {
                    console.error('Flutterwave tokenized charge error:', error.response?.data || error.message);
                    throw error;
                }
            }
        }
    };

    console.log('✓ Flutterwave initialized (using direct API)');
} else {
    console.warn('⚠️  Flutterwave not configured - FLUTTERWAVE_SECRET_KEY environment variable is required');
    console.warn('   Flutterwave billing endpoints will not work without proper configuration');

    // Create a mock/stub object when Flutterwave is not configured
    const notConfigured = async () => {
        throw new Error('Flutterwave not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable.');
    };
    flw = {
        Payment: { initialize: notConfigured },
        Transaction: { verify: notConfigured },
        Tokenized: { charge: notConfigured }
    };
}

module.exports = flw;
