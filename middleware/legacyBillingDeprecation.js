const SUCCESSOR = '/api/v1/billing';

function isProviderCallback(req) {
  const path = String(req.path || '').toLowerCase();
  return path.endsWith('/webhook') || path.endsWith('/verify');
}

function legacyBillingDeprecation(name) {
  return function legacyBillingMiddleware(req, res, next) {
    res.set('Deprecation', 'true');
    res.set('Link', `<${SUCCESSOR}>; rel="successor-version"`);
    res.set('Warning', `299 - "${name} is deprecated; use ${SUCCESSOR}"`);

    if (isProviderCallback(req)) return next();

    if (String(process.env.LEGACY_BILLING_RETIRED || '').toLowerCase() === 'true') {
      return res.status(410).json({
        success: false,
        code: 'LEGACY_BILLING_RETIRED',
        message: `${name} has been retired. Use ${SUCCESSOR}.`,
        successor: SUCCESSOR,
      });
    }

    res.on('finish', () => {
      console.warn(`[legacy-billing] ${req.method} ${req.originalUrl} user=${req.userId || 'anonymous'} route=${name}`);
    });
    return next();
  };
}

module.exports = legacyBillingDeprecation;
