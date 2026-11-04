/**
 * Stable HTTP error envelope + request correlation IDs.
 *
 * Route handlers used to forward `error.message` straight to clients, which
 * leaks database names, file paths, and provider diagnostics. Public responses
 * now carry a stable message, an optional machine-readable code, and the
 * request id; the private diagnostic stays in the server log (and Sentry).
 */
const crypto = require('crypto');

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

function requestIdMiddleware(req, res, next) {
    const incoming = req.headers?.[REQUEST_ID_HEADER];
    const requestId = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
        ? incoming
        : crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
}

function captureError(error, context) {
    try {
        require('./sentry').captureError(error, context);
    } catch {
        // Sentry is optional (tests, local runs); logging already happened.
    }
}

/**
 * Respond with a 500 that never includes the private exception text.
 *
 * `envelope: 'error'` keeps the `{ error }` shape used by the VFS routes;
 * everything else uses `{ success, message, code, requestId }`.
 */
function sendInternalError(req, res, error, options = {}) {
    const requestId = req?.id;
    const route = req ? `${req.method} ${req.originalUrl || req.path}` : '';
    const diagnostic = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
    console.error(`[http]${requestId ? ` request=${requestId}` : ''} ${route || 'request'} failed:`, diagnostic.stack || diagnostic.message);
    captureError(diagnostic, {
        route,
        requestId,
        userId: req?.userId || req?.user?._id || req?.user?.id,
    });

    if (res.headersSent) return undefined;

    const message = options.message || 'Something went wrong. Please try again.';
    const code = options.code || 'INTERNAL_ERROR';
    if (options.envelope === 'error') {
        return res.status(500).json({
            error: message,
            ...(requestId ? { requestId } : {}),
        });
    }
    return res.status(500).json({
        success: false,
        message,
        code,
        ...(requestId ? { requestId } : {}),
    });
}

module.exports = {
    REQUEST_ID_HEADER,
    requestIdMiddleware,
    sendInternalError,
};
