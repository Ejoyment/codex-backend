/**
 * Integration sync must call the provider, and must fail explicitly instead of
 * writing invented rows into IntegrationData.
 */
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const axios = require('axios');
const { fetchPlatformData } = require('../utils/providerSync');

function integration(provider, overrides = {}) {
  return {
    provider,
    accessToken: 'token-abc',
    personalAccessToken: null,
    metadata: new Map(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('github sync maps real repositories into IntegrationData records', async () => {
  axios.get.mockResolvedValue({
    data: [
      { full_name: 'acme/app', description: 'App', private: false, stargazers_count: 3, language: 'JS', updated_at: '2026-11-01T00:00:00Z' },
    ],
  });

  const records = await fetchPlatformData(integration('github'));

  expect(axios.get).toHaveBeenCalledWith('https://api.github.com/user/repos', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
  }));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    platform: 'github',
    dataType: 'repositories',
    data: { name: 'acme/app', stars: 3, language: 'JS' },
  });
});

test('figma sync stores the profile, not invented projects', async () => {
  axios.get.mockResolvedValue({ data: { id: 'u1', handle: 'designer', email: 'd@example.com' } });

  const records = await fetchPlatformData(integration('figma'));

  expect(records[0]).toMatchObject({ platform: 'figma', dataType: 'profile', data: { handle: 'designer' } });
});

test('slack reports a provider-level failure instead of pretending success', async () => {
  axios.get.mockResolvedValue({ data: { ok: false, error: 'invalid_auth' } });

  const err = await fetchPlatformData(integration('slack')).catch((e) => e);

  expect(err.code).toBe('PROVIDER_SYNC_FAILED');
  expect(err.message).not.toMatch(/invalid_auth/);
});

test('a rejected token maps to reconnect instructions', async () => {
  axios.get.mockRejectedValue({ response: { status: 401 }, message: 'Unauthorized' });

  const err = await fetchPlatformData(integration('github')).catch((e) => e);

  expect(err.status).toBe(401);
  expect(err.code).toBe('PROVIDER_TOKEN_REJECTED');
  expect(err.message).toMatch(/Reconnect GitHub/);
});

test('an unsupported platform is an explicit 501', async () => {
  const err = await fetchPlatformData(integration('vscode')).catch((e) => e);

  expect(err.status).toBe(501);
  expect(err.code).toBe('PROVIDER_SYNC_UNSUPPORTED');
  expect(axios.get).not.toHaveBeenCalled();
});
