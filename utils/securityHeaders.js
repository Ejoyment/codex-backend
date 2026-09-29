/**
 * Security Headers Middleware
 * 
 * Sets security headers for all responses including COOP/COEP
 * headers needed for WebContainer support.
 */

function enforceSecurityHeaders() {
    return (req, res, next) => {
        // COOP/COEP for WebContainer SharedArrayBuffer support
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

        // General security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        // Scope HSTS to this host only: includeSubDomains/preload would force
        // HTTPS on every future *.buildrshq.dev deployment before those
        // subdomains have valid certificates, breaking them in browsers.
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; img-src 'self' data:; font-src 'self'");
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

        // Remove server header
        res.removeHeader('X-Powered-By');

        next();
    };
}

module.exports = { enforceSecurityHeaders };
