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
const { resolvePrice } = require('../../config/regionalPricing');

const router = express.Router();

// Server-side pricing (decisions 3.5/3.6): amounts and currencies come from
// docs/regionalPricing.json via resolvePrice — client-supplied `amount` is
// NEVER trusted (pay-$0.01-for-pro), redirect URLs are fixed (client URLs are
// open redirect), and team tiers bill in standard USD. Yearly off-Stripe
// rails are still 400 (no multiple decided).
const MONTHLY_USD = { pro: 20, pro_plus: 60, team_standard: 40, team_premium: 120 };

// Checkout needs auth; webhook must NOT (providers call it without a JWT).
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { plan = 'pro', interval = 'monthly', country, currency, provider: hint, email, lat, lng } = req.body || {};
    if (hint === 'stripe') {
      return res.status(400).json({ success: false, message: 'Stripe rail retired — see regional gateway map' });
    }
    const provider = hint || routeProvider({ country, currency });
    const adapter = getAdapter(provider);
    const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5500';
    const priced = resolvePrice(plan, currency);
    const params = {
      userId: req.userId,
      email: email || req.user?.email,
      plan,
      interval,
      currency: priced.currency,
      successUrl: `${FRONTEND}/payment-success?provider=${provider}`,
      cancelUrl: `${FRONTEND}/pricing`,
      callbackUrl: `${FRONTEND}/payment-success?provider=${provider}`,
      redirectUrl: `${FRONTEND}/payment-success?provider=${provider}`,
    };
    if (provider !== 'stripe') {
      // Stripe prices via env price IDs (immune while the rail exists);
      // other rails take amounts computed above — never the client's.
      if (interval !== 'monthly') {
        return res.status(400).json({ success: false, message: 'Yearly billing on this rail is not available yet' });
      }
      const monthly = priced.amount != null ? priced.amount : MONTHLY_USD[plan];
      if (!monthly) {
        return res.status(400).json({ success: false, message: 'Unknown plan (enterprise is custom pricing)' });
      }
      params.amount = monthly;
    }
    const result = await adapter.createCheckout(params);
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
    const outcome = await entitlementService.applyWebhookEvent(normalized);
    if (!outcome.applied) {
      // Idempotent replay or unmapped type: answer 200 with current state.
      // Providers retry non-2xx, so neither 409 nor a fake success is right.
      return res.json({
        success: true,
        data: {
          eventId: normalized.eventId,
          status: outcome.entitlement?.status,
          plan: outcome.entitlement?.plan,
          applied: false,
          reason: outcome.reason,
        },
      });
    }
    const { entitlement } = outcome;
    res.json({ success: true, data: { eventId: normalized.eventId, status: entitlement.status, plan: entitlement.plan } });
  } catch (err) {
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
