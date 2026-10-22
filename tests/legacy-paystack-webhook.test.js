/**
 * The legacy Paystack webhook must stay retired: it used to activate a
 * subscription from a customer code alone, without checking the charge
 * amount, currency, or metadata.
 */
const express = require('express');
const request = require('supertest');
const subscriptionRouter = require('../routes/subscription');

describe('legacy Paystack webhook', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);

    test('returns 410 and does not activate anything', async () => {
        const response = await request(app)
            .post('/api/subscription/payment/paystack')
            .send({
                event: 'charge.success',
                data: {
                    amount: 1,
                    currency: 'USD',
                    customer: { customer_code: 'CUS_anything' },
                    metadata: { userId: '507f1f77bcf86cd799439011' }
                }
            });

        expect(response.status).toBe(410);
        expect(response.body.message).toMatch(/paystack-billing\/webhook/);
    });
});
