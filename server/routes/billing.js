/**
 * Phase 3 — Billing endpoints (multi-rail).
 * POST /api/v1/billing/checkout
 * POST /api/v1/billing/webhook/:provider   (raw body, signature-verified)
 * GET  /api/v1/billing/entitlement          (app reads entitlements ONLY)
 * POST /api/v1/billing/cancel
 */
const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { routeProvider, getAdapter } = require('../services/billing/paymentRouter');
const entitlementService = require('../services/billing/entitlementService');
const { nearestEdge } = require('../services/billing/edgeRouter');

const router = express.Router();

// Checkout needs auth; webhook must NOT (providers call it without a JWT).
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { plan = 'professional', interval = 'monthly', country, currency, provider: hint, amount, email, successUrl, cancelUrl, callbackUrl, redirectUrl, lat, lng } = req.body || {};
    const provider = hint || routeProvider({ country, currency });
    const adapter = getAdapter(provider);
    const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5500';
    const result = await adapter.createCheckout({
      userId: req.userId,
      email: email || req.user?.email,
      plan,
      interval,
      amount,
      currency,
      successUrl: successUrl || `${FRONTEND}/payment-success?provider=${provider}`,
      cancelUrl: cancelUrl || `${FRONTEND}/pricing`,
      callbackUrl: callbackUrl || `${FRONTEND}/payment-success?provider=${provider}`,
      redirectUrl: redirectUrl || `${FRONTEND}/payment-success?provider=${provider}`,
    });
    res.json({ success: true, data: { provider, ...result, edge: nearestEdge({ country, currency, lat, lng }) } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// NOTE: req.rawBody is captured by the express.json verify hook in server.js
// for this path, so signature verification sees the exact provider bytes.
router.post('/webhook/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const adapter = getAdapter(provider);
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const signature =
      req.headers['stripe-signature'] || req.headers['x-paystack-signature'] || req.headers['verif-hash'];
    const normalized = await adapter.verifyWebhook({ rawBody, signature, headers: req.headers });
    normalized.provider = provider;
    const { entitlement } = await entitlementService.applyWebhookEvent(normalized);
    res.json({ success: true, data: { eventId: normalized.eventId, status: entitlement.status, plan: entitlement.plan } });
  } catch (err) {
    if (err.code === 'DUPLICATE_EVENT') {
      return res.status(409).json({ success: false, message: 'Duplicate event — already applied' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/entitlement', authenticateToken, async (req, res) => {
  try {
    const e = await entitlementService.getEntitlement(req.userId);
    res.json({
      success: true,
      data: {
        plan: e.plan,
        status: e.status,
        provider: e.provider,
        currency: e.currency,
        currentPeriodEnd: e.currentPeriodEnd,
        cancelAtPeriodEnd: e.cancelAtPeriodEnd,
        active: e.isActive(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const e = await entitlementService.getEntitlement(req.userId);
    if (e.provider && e.providerSubscriptionId) {
      try {
        const adapter = getAdapter(e.provider);
        await adapter.cancelSubscription({ subscriptionId: e.providerSubscriptionId, customerId: e.providerCustomerId });
      } catch (err) {
        // Provider cancel failure must not block local entitlement update.
        console.error('provider cancel failed:', err.message);
      }
    }
    const updated = await entitlementService.markCancelled(req.userId, { atPeriodEnd: true });
    res.json({ success: true, data: { status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
