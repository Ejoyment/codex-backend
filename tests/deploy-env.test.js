const crypto = require('crypto');

const {
  KEY_ENV,
  KEY_RE,
  looksSecret,
  normalizeEnv,
  toObject,
  toEnvObject,
  redact,
} = require('../utils/deployEnv');

const savedKey = process.env[KEY_ENV];

afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = savedKey;
});

describe('deployEnv', () => {
  test('recognises credential-shaped keys', () => {
    expect(looksSecret('DATABASE_URL')).toBe(true);
    expect(looksSecret('STRIPE_API_KEY')).toBe(true);
    expect(looksSecret('SESSION_SECRET')).toBe(true);
    expect(looksSecret('PORT')).toBe(false);
    expect(looksSecret('NODE_ENV')).toBe(false);
  });

  test('validates keys and keeps non-secret values readable', () => {
    const entries = normalizeEnv({
      PORT: '8080',
      'bad key': 'x',
      '1INVALID': 'x',
      LOG_LEVEL: 'info',
    });

    expect(entries).toEqual([
      { key: 'PORT', value: '8080', secret: false, encrypted: false },
      { key: 'LOG_LEVEL', value: 'info', secret: false, encrypted: false },
    ]);
    expect(KEY_RE.test('PORT')).toBe(true);
  });

  test('encrypts secret values at rest and decrypts them for the container', () => {
    process.env[KEY_ENV] = crypto.randomBytes(32).toString('hex');

    const entries = normalizeEnv({ API_KEY: 'super-secret-value', PORT: '3000' });
    const secret = entries.find((entry) => entry.key === 'API_KEY');

    expect(secret.secret).toBe(true);
    expect(secret.encrypted).toBe(true);
    expect(secret.value).not.toContain('super-secret-value');
    expect(secret.value.startsWith('v1:')).toBe(true);
    expect(toObject(entries)).toEqual({ API_KEY: 'super-secret-value', PORT: '3000' });
  });

  test('redact hides secret values but reports whether they are set', () => {
    process.env[KEY_ENV] = crypto.randomBytes(32).toString('hex');
    const entries = normalizeEnv({ API_KEY: 'secret', PORT: '3000' });

    expect(redact(entries)).toEqual([
      { key: 'API_KEY', secret: true, isSet: true },
      { key: 'PORT', secret: false, value: '3000' },
    ]);
  });

  test('normalizeEnv(undefined) preserves existing entries', () => {
    const existing = [{ key: 'PORT', value: '8080', secret: false, encrypted: false }];
    expect(normalizeEnv(undefined, { existing })).toEqual(existing);
  });

  test('toEnvObject accepts a plain object and storage entries', () => {
    process.env[KEY_ENV] = crypto.randomBytes(32).toString('hex');
    const entries = normalizeEnv({ API_KEY: 'secret', PORT: '3000' });

    expect(toEnvObject({ PORT: '3000', 'not valid': 'x' })).toEqual({ PORT: '3000' });
    expect(toEnvObject(entries)).toEqual({ API_KEY: 'secret', PORT: '3000' });
  });

  test('drops values longer than the cap instead of storing unbounded data', () => {
    const entries = normalizeEnv({ BIG: 'x'.repeat(5000), SMALL: 'ok' });
    expect(entries.map((entry) => entry.key)).toEqual(['SMALL']);
  });
});
