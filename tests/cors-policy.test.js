/**
 * DES-05 — socket.io and HTTP CORS share one allowlist, so a host can no
 * longer be valid on one transport and rejected on the other.
 */
const { isAllowedOrigin, allowedOrigins } = require('../utils/originPolicy');

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test('allows the shipped app origins', () => {
  expect(isAllowedOrigin('https://buildrshq.dev')).toBe(true);
  expect(isAllowedOrigin('https://www.buildrshq.dev')).toBe(true);
  expect(isAllowedOrigin('https://waitlist.buildrshq.dev')).toBe(true);
});

test('allows any localhost or loopback port for local development', () => {
  expect(isAllowedOrigin('http://localhost:3100')).toBe(true);
  expect(isAllowedOrigin('http://127.0.0.1:8080')).toBe(true);
  expect(isAllowedOrigin('http://localhost:not-a-port')).toBe(false);
});

test('allows requests without an Origin header', () => {
  expect(isAllowedOrigin(undefined)).toBe(true);
  expect(isAllowedOrigin('')).toBe(true);
});

test('rejects arbitrary hosts, including public-suffix previews', () => {
  expect(isAllowedOrigin('https://evil.example')).toBe(false);
  expect(isAllowedOrigin('https://codex-backend-7utu.onrender.com')).toBe(false);
  expect(isAllowedOrigin('https://buildrshq.dev.evil.example')).toBe(false);
});

test('FRONTEND_URL and CORS_EXTRA_ORIGINS extend the same allowlist', () => {
  process.env.FRONTEND_URL = 'https://preview.buildrs.app';
  process.env.CORS_EXTRA_ORIGINS = ' https://pr-42.example.dev , https://pr-43.example.dev ';

  expect(isAllowedOrigin('https://preview.buildrs.app')).toBe(true);
  expect(isAllowedOrigin('https://pr-42.example.dev')).toBe(true);
  expect(isAllowedOrigin('https://pr-43.example.dev')).toBe(true);
  expect(allowedOrigins()).toContain('https://pr-42.example.dev');
  expect(isAllowedOrigin('https://pr-44.example.dev')).toBe(false);
});
