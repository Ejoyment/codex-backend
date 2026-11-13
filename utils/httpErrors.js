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
const INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

function classifyError(error, options = {}) {
    if (!error) return { status: 500, message: options.message || INTERNAL_MESSAGE, code: 'INTERNAL_ERROR' };

    if (error.name === 'ValidationError' && error.errors) {
        const first = Object.values(error.errors).map((item) => item?.message).find(Boolean);
        return { status: 400, message: options.message || first || 'Invalid request.', code: 'VALIDATION_ERROR' };
    }
    if (error.name === 'CastError') {
        return { status: 400, message: options.message || 'Invalid identifier.', code: 'INVALID_ID' };
    }
    if (error.code === 11000) {
        return { status: 409, message: options.message || 'That value is already in use.', code: 'DUPLICATE_KEY' };
    }

    const status = Number(error.statusCode ?? error.status);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
        return {
            status,
            message: error.message || options.message || 'Request could not be completed.',
            code: typeof error.code === 'string' ? error.code : 'REQUEST_ERROR',
        };
    }
    return { status: 500, message: options.message || INTERNAL_MESSAGE, code: options.code || 'INTERNAL_ERROR' };
}

/**
 * Respond with the classified status. Client errors keep their authored text;
 * 5xx responses go through sendInternalError so the diagnostic never ships.
 */
function sendError(req, res, error, options = {}) {
    const classified = classifyError(error, options);
    if (classified.status >= 500 || res.headersSent) {
        return sendInternalError(req, res, error, {
            message: options.message,
            code: options.code,
            envelope: options.envelope,
            status: options.status,
        });
    }
    const requestId = req?.id;
    return res.status(classified.status).json({
        success: false,
        message: classified.message,
        code: classified.code,
        ...(requestId ? { requestId } : {}),
    });
}

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

    const message = options.message || INTERNAL_MESSAGE;
    const code = options.code || 'INTERNAL_ERROR';
    const requestedStatus = Number(options.status);
    const status = Number.isInteger(requestedStatus) && requestedStatus >= 500 ? requestedStatus : 500;
    if (options.envelope === 'error') {
        return res.status(status).json({
            error: message,
            ...(requestId ? { requestId } : {}),
        });
    }
    return res.status(status).json({
        success: false,
        message,
        code,
        ...(requestId ? { requestId } : {}),
    });
}

module.exports = {
    REQUEST_ID_HEADER,
    INTERNAL_MESSAGE,
    requestIdMiddleware,
    classifyError,
    sendError,
    sendInternalError,
};
