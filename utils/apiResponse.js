/**
 * Canonical API envelope (audit rec 13).
 *
 * Success: { success: true, ...data }
 * Failure: { success: false, message, code? }
 *
 * The frontend (lib/api.js) reads `data.message || data.error`, but new and
 * migrated code must emit `message` — never a bare `{ error }` shape
 * (routes/support.js was migrated wholesale). Use these helpers instead of
 * hand-rolled res.status().json() calls.
 */
function ok(res, data = {}) {
    return res.json({ success: true, ...data });
}

function fail(res, status, message, code) {
    const body = { success: false, message };
    if (code) body.code = code;
    return res.status(status).json(body);
}

const badRequest = (res, message, code) => fail(res, 400, message, code);
const unauthorized = (res, message = 'Authentication required', code) => fail(res, 401, message, code);
const forbidden = (res, message = 'Access denied', code) => fail(res, 403, message, code);
const notFound = (res, message = 'Not found', code) => fail(res, 404, message, code);
const conflict = (res, message, code) => fail(res, 409, message, code);

module.exports = { ok, fail, badRequest, unauthorized, forbidden, notFound, conflict };
