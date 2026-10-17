/**
 * Sentry error tracking. DSN-gated: no SENTRY_DSN, no traffic — the rest of
 * the app must never depend on this module.
 */
let enabled = false;

try {
  if (process.env.SENTRY_DSN) {
    // eslint-disable-next-line global-require
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
    });
    enabled = true;
  }
} catch (err) {
  // Broken install must never take down boot; local console still logs.
  console.error('Sentry init failed (continuing without it):', err.message);
}

function captureError(err, context) {
  if (!enabled) return;
  try {
    // eslint-disable-next-line global-require
    const Sentry = require('@sentry/node');
    if (context) {
      Sentry.withScope((scope) => {
        if (context.userId) scope.setUser({ id: String(context.userId) });
        if (context.route) scope.setTag('route', context.route);
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  } catch {
    // Reporting must never throw into request handling.
  }
}

module.exports = { captureError, isEnabled: () => enabled };
