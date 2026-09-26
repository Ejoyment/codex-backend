/**
 * Phase 3 — COOP/COEP headers (required for WebContainer cross-origin isolation).
 * Applied where the app is served (Next.js headers + Express fallback).
 */
function phase3SecurityHeaders(req, res, next) {
  // Only isolate app routes; never break API/socket traffic.
  const p = req.path || '';
  const isAppRoute = p.startsWith('/app') || p.startsWith('/workspace') || p === '/';
  if (isAppRoute) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }
  next();
}

/**
 * Phase 3 — express.json `verify` hook that preserves the exact raw bytes
 * for payment webhook signature verification (Stripe/Paystack/Flutterwave).
 * express.json() consumes the request stream, so a later express.raw()
 * mount would see an empty body — this hook is the only reliable capture.
 */
function captureWebhookRawBody(req, res, buf) {
  if (req.originalUrl && req.originalUrl.includes('/api/v1/billing/webhook')) {
    req.rawBody = Buffer.from(buf);
  }
}

module.exports = { phase3SecurityHeaders, captureWebhookRawBody };
