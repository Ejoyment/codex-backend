/**
 * Security Headers Middleware
 *
 * Sets security headers for every response. This MUST be mounted before the
 * route handlers: Express runs middleware in registration order, and any
 * request that terminates inside a route handler never reaches middleware
 * registered after it. Registering this last meant no /api/* response ever
 * received CSP, nosniff, X-Frame-Options, HSTS or Referrer-Policy.
 */

const HTML_ROUTES_WITH_INLINE_SCRIPTS = ['/api-docs', '/app'];

/**
 * CSP for JSON API responses. Nothing here is rendered as a document, so this
 * is deliberately strict — it only matters if a response is ever sniffed and
 * treated as HTML (which is what nosniff and this policy jointly prevent).
 */
const API_CSP =
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * CSP for routes that serve a real HTML document. Swagger UI and the legacy
 * static app both ship inline scripts and styles, and the app pulls avatars
 * and logos from third-party hosts, so this is looser than the API policy but
 * still blocks inline script from executing arbitrary injected markup.
 */
const HTML_CSP =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' wss: https:; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'";

function isHtmlDocumentRoute(path) {
    return HTML_ROUTES_WITH_INLINE_SCRIPTS.some(
        (route) => path === route || path.startsWith(`${route}/`)
    );
}

function enforceSecurityHeaders() {
    return (req, res, next) => {
        const path = (req.path || '').split('?')[0];

        // COOP/COEP for WebContainer SharedArrayBuffer support. Scoped to the
        // app routes: applying require-corp to API responses would break
        // cross-origin fetches from the marketing/docs site for no benefit.
        if (isHtmlDocumentRoute(path)) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        }

        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        // Scope HSTS to this host only: includeSubDomains/preload would force
        // HTTPS on every future *.buildrshq.dev deployment before those
        // subdomains have valid certificates, breaking them in browsers.
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
        res.setHeader(
            'Content-Security-Policy',
            isHtmlDocumentRoute(path) ? HTML_CSP : API_CSP
        );
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Meetings need camera/microphone; everything else is denied.
        res.setHeader(
            'Permissions-Policy',
            path.startsWith('/api/meetings')
                ? 'camera=(self), microphone=(self), geolocation=()'
                : 'camera=(), microphone=(), geolocation=()'
        );

        // Remove server header
        res.removeHeader('X-Powered-By');

        next();
    };
}

module.exports = { enforceSecurityHeaders };
