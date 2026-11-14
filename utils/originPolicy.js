/**
 * Single source of truth for the credentialed CORS allowlist (DES-05).
 *
 * Previously `server.js` built the same list twice — once for socket.io and
 * once for the HTTP `cors()` middleware — so a host added to one drifted from
 * the other. Both now call `isAllowedOrigin`.
 *
 * `CORS_EXTRA_ORIGINS` is the only way to add a host without a deploy (preview
 * deploys). Never wildcard a public suffix such as `*.onrender.com`: anyone can
 * host there, and these requests carry credentials.
 */

const STATIC_ALLOWED_ORIGINS = [
  'https://buildrshq.dev',
  'http://buildrshq.dev',
  'https://www.buildrshq.dev',
  'http://www.buildrshq.dev',
  'https://waitlist.buildrshq.dev',
  'http://waitlist.buildrshq.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function extraOrigins() {
  return String(process.env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function allowedOrigins() {
  return [process.env.FRONTEND_URL, ...STATIC_ALLOWED_ORIGINS, ...extraOrigins()].filter(Boolean);
}

/**
 * Requests without an Origin header (curl, server-to-server, same-origin) are
 * allowed; the allowlist only constrains cross-origin browser callers.
 */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins().includes(origin)) return true;
  return LOCAL_DEV_ORIGIN.test(origin);
}

module.exports = { isAllowedOrigin, allowedOrigins, STATIC_ALLOWED_ORIGINS };
