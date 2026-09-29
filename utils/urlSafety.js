/**
 * Outbound URL validation for user-supplied server URLs (MCP servers,
 * webhooks, remote probes).
 *
 * A backend that fetches a URL a user typed is an SSRF primitive: the request
 * originates inside the network perimeter, so a user can aim it at
 * 169.254.169.254 (cloud metadata → instance credentials), localhost:27017
 * (MongoDB), or any internal service that is not exposed publicly. The
 * response body is returned to the caller, which turns "blind" SSRF into full
 * data exfiltration.
 *
 * This module validates the *shape* of a URL (scheme, DNS resolution, private
 * ranges). It is one layer, not a complete SSRF defence: a DNS record can
 * resolve to a public IP and still be rebound to a private one between
 * validation and connection (DNS rebinding). Callers must additionally not
 * echo response bodies back to untrusted users.
 */

const dns = require('dns').promises;
const net = require('net');

const PRIVATE_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'ip6-localhost',
    'ip6-loopback',
    'metadata',
    'metadata.google.internal',
]);

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return false;
    }
    const [a, b] = parts;
    if (a === 0) return true;                       // 0.0.0.0/8 "this network"
    if (a === 10) return true;                      // 10/8 private
    if (a === 127) return true;                     // loopback
    if (a === 169 && b === 254) return true;        // link-local, incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
    if (a === 192 && b === 168) return true;        // 192.168/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 192 && b === 0) return true;          // 192.0.0.0/24 IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true;                       // multicast + reserved
    return false;
}

function isPrivateIPv6(ip) {
    const addr = ip.toLowerCase().split('%')[0];
    if (addr === '::' || addr === '::1') return true;
    if (addr.startsWith('fe80') || addr.startsWith('fc') || addr.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:127.0.0.1) inherits the IPv4 classification.
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
}

function isPrivateAddress(ip) {
    const type = net.isIP(ip);
    if (type === 4) return isPrivateIPv4(ip);
    if (type === 6) return isPrivateIPv6(ip);
    return true; // not an IP literal — treat as unsafe until resolved
}

/**
 * Validate an outbound URL a user supplied.
 * Returns { ok: true, url } or { ok: false, reason }.
 *
 * Pass { allowPrivate: true } only for URLs that are provably internal to a
 * deployment the operator controls (never for user input).
 */
async function validateOutboundUrl(rawUrl, { allowPrivate = false, protocols = ['http:', 'https:'] } = {}) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return { ok: false, reason: 'URL is required' };
    }
    if (rawUrl.length > 2048) {
        return { ok: false, reason: 'URL is too long' };
    }

    let url;
    try {
        url = new URL(rawUrl);
    } catch (_) {
        return { ok: false, reason: 'Invalid URL' };
    }

    if (!protocols.includes(url.protocol)) {
        return { ok: false, reason: `Unsupported protocol: ${url.protocol}` };
    }
    if (url.username || url.password) {
        // Credentials in URLs leak into logs and error messages.
        return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname) {
        return { ok: false, reason: 'URL is missing a hostname' };
    }

    if (allowPrivate) {
        return { ok: true, url };
    }

    if (PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
        return { ok: false, reason: 'Internal hostnames are not allowed' };
    }

    if (net.isIP(hostname)) {
        if (isPrivateAddress(hostname)) {
            return { ok: false, reason: 'Private or loopback addresses are not allowed' };
        }
        return { ok: true, url };
    }

    // Resolve before connecting so a hostname pointing at 127.0.0.1 or the
    // metadata IP is rejected here rather than reached by fetch().
    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (_) {
        return { ok: false, reason: 'Hostname could not be resolved' };
    }
    if (!addresses.length) {
        return { ok: false, reason: 'Hostname could not be resolved' };
    }
    if (addresses.some((a) => isPrivateAddress(a.address))) {
        return { ok: false, reason: 'Hostname resolves to a private or loopback address' };
    }

    return { ok: true, url };
}

module.exports = {
    validateOutboundUrl,
    isPrivateAddress,
    isPrivateIPv4,
    isPrivateIPv6,
};
