const express = require('express');
const request = require('supertest');
const legacyBillingDeprecation = require('../middleware/legacyBillingDeprecation');

const savedRetired = process.env.LEGACY_BILLING_RETIRED;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/subscription', legacyBillingDeprecation('legacy subscription API'), (req, res) => {
    res.json({ success: true, path: req.path });
  });
  return app;
}

afterEach(() => {
  if (savedRetired === undefined) delete process.env.LEGACY_BILLING_RETIRED;
  else process.env.LEGACY_BILLING_RETIRED = savedRetired;
});

describe('legacy billing deprecation', () => {
  test('advertises the canonical successor and still serves callers', async () => {
    delete process.env.LEGACY_BILLING_RETIRED;
    const res = await request(buildApp()).get('/api/subscription/current');

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('/api/v1/billing');
  });

  test('returns 410 for retired non-webhook routes', async () => {
    process.env.LEGACY_BILLING_RETIRED = 'true';
    const res = await request(buildApp()).post('/api/subscription/cancel');

    expect(res.status).toBe(410);
    expect(res.body.code).toBe('LEGACY_BILLING_RETIRED');
    expect(res.body.successor).toBe('/api/v1/billing');
  });

  test('keeps provider callbacks alive during retirement', async () => {
    process.env.LEGACY_BILLING_RETIRED = 'true';
    const paths = [
      ['post', '/api/subscription/webhook'],
      ['post', '/api/subscription/webhook/stripe'],
      ['post', '/api/subscription/payment/stripe'],
      ['get', '/api/subscription/verify'],
    ];

    for (const [method, path] of paths) {
      const res = await request(buildApp())[method](path);
      expect(res.status).toBe(200);
    }
  });
});
