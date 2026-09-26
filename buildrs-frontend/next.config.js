/** @type {import('next').NextConfig} */
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
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com'}/api/:path*`,
      },
      {
        source: '/api-docs/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com'}/api-docs/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://codex-backend-7utu.onrender.com'}/uploads/:path*`,
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
