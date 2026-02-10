const axios = require('axios');

// Initialize Paystack with secret key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error('⚠️  PAYSTACK_SECRET_KEY not found in environment variables');
    console.error('Please add PAYSTACK_SECRET_KEY to your environment variables');
}

// Paystack API base URL
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Create axios instance with Paystack configuration
const paystackAPI = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    }
});

// Paystack SDK wrapper
const paystack = {
    transaction: {
        initialize: async (data) => {
            try {
                const response = await paystackAPI.post('/transaction/initialize', data);
                return response.data;
            } catch (error) {
                console.error('Paystack initialize error:', error.response?.data || error.message);
                throw error;
            }
        },
        verify: async ({ reference }) => {
            try {
                const response = await paystackAPI.get(`/transaction/verify/${reference}`);
                return response.data;
            } catch (error) {
                console.error('Paystack verify error:', error.response?.data || error.message);
                throw error;
            }
        },
        charge: async (data) => {
            try {
                const response = await paystackAPI.post('/transaction/charge_authorization', data);
                return response.data;
            } catch (error) {
                console.error('Paystack charge error:', error.response?.data || error.message);
                throw error;
            }
        }
    },
    customer: {
        create: async (data) => {
            try {
                const response = await paystackAPI.post('/customer', data);
                return response.data;
            } catch (error) {
                console.error('Paystack customer create error:', error.response?.data || error.message);
                throw error;
            }
        }
    }
};

console.log('✓ Paystack SDK initialized (using direct API)');

module.exports = paystack;
