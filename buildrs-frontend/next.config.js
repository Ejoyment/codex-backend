/** @type {import('next').NextConfig} */
// Strip trailing slashes and a trailing `/api` so a `NEXT_PUBLIC_API_URL` such
// as `https://host/api` can't double the prefix into `/api/api/...` in rewrites.
const API_ORIGIN = String(
  process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com'
)
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '')
  .replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  // Phase 3 — COOP/COEP cross-origin isolation (WebContainer requires this).
  async headers() {
    return [
      {
        source: '/workspace/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/editor',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  async rewrites() {    return [
      {
        source: '/api/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
      {
        source: '/api-docs/:path*',
        destination: `${API_ORIGIN}/api-docs/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${API_ORIGIN}/uploads/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
      {
        protocol: 'https',
        hostname: 'buildrshq.dev',
      },
      {
        protocol: 'http',
        hostname: 'buildrshq.dev',
      },
    ],
  },
};

module.exports = nextConfig;
