/**
 * Deployment environment variables.
 *
 * A deployment can carry environment variables that are injected into the
 * running container (`docker run --env KEY=value`). Values for keys that look
 * like credentials are marked secret and, when DEPLOY_ENV_KEY is configured,
 * encrypted at rest with AES-256-GCM. Secret values are never returned by the
 * deployment API and are never shown to the repair agent — the agent may only
 * *declare* that a secret is required, so it can never hardcode one.
 */

const crypto = require('crypto');

const KEY_ENV = 'DEPLOY_ENV_KEY';
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SECRET_KEY_RE = /(SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|DATABASE_URL|CONNECTION_STRING|DSN|AUTH)/i;
const MAX_VARS = 64;
const MAX_VALUE_LENGTH = 4000;

let warnedUnencrypted = false;

function keyBuffer() {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  let buf;
  if (/^[0-9a-f]{64}$/i.test(raw)) buf = Buffer.from(raw, 'hex');
  else {
    try { buf = Buffer.from(raw, 'base64'); } catch (_) { return null; }
  }
  return buf.length === 32 ? buf : null;
}

function encrypt(value) {
  const key = keyBuffer();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(payload) {
  const key = keyBuffer();
  if (!key) throw new Error('DEPLOY_ENV_KEY is required to read encrypted values');
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported encrypted env value');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function looksSecret(key) {
  return SECRET_KEY_RE.test(String(key || ''));
}

function plain(entry) {
  return typeof entry?.toObject === 'function' ? entry.toObject() : entry;
}

/**
 * Validate and normalise an env payload into storage entries.
 * Accepts an object ({ KEY: 'value' }) or an array of { key, value, secret }.
 * When `input` is undefined the existing entries are returned unchanged.
 */
function normalizeEnv(input, { existing = [] } = {}) {
  if (input === undefined) {
    return (existing || []).map(plain).filter((entry) => entry?.key);
  }

  const source = Array.isArray(input)
    ? input.map((entry) => [entry?.key, entry?.value, entry?.secret])
    : Object.entries(input || {}).map(([key, value]) => [key, value, undefined]);

  const next = new Map();
  for (const [rawKey, rawValue, explicitSecret] of source) {
    if (next.size >= MAX_VARS) break;
    const key = String(rawKey || '').trim();
    if (!KEY_RE.test(key)) continue;
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
    if (value.length > MAX_VALUE_LENGTH) continue;
    const secret = explicitSecret === undefined ? looksSecret(key) : !!explicitSecret;
    if (secret) {
      const sealed = encrypt(value);
      if (!sealed && value && !warnedUnencrypted) {
        warnedUnencrypted = true;
        console.warn(`[deploy-env] ${KEY_ENV} is not set; secret deployment variables are stored unencrypted.`);
      }
      next.set(key, { key, value: sealed || value, secret: true, encrypted: !!sealed });
    } else {
      next.set(key, { key, value, secret: false, encrypted: false });
    }
  }
  return [...next.values()];
}

/**
 * Decrypt storage entries into the object passed to `docker run --env`.
 * Unreadable entries are skipped rather than failing the whole deployment.
 */
function toObject(entries = []) {
  const env = {};
  for (const raw of entries || []) {
    const entry = plain(raw);
    if (!entry?.key) continue;
    let value = entry.value;
    if (entry.encrypted) {
      try {
        value = decrypt(entry.value);
      } catch (error) {
        console.warn(`[deploy-env] could not decrypt ${entry.key}: ${error.message}`);
        continue;
      }
    }
    env[entry.key] = value === null || value === undefined ? '' : String(value);
  }
  return env;
}

/**
 * Accept either a plain object or storage entries and return a validated
 * plaintext object ready for `docker run --env`.
 */
function toEnvObject(input) {
  if (Array.isArray(input)) return toObject(input);
  const env = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const key = String(rawKey || '').trim();
    if (!KEY_RE.test(key)) continue;
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
    if (value.length > MAX_VALUE_LENGTH) continue;
    env[key] = value;
  }
  return env;
}

/**
 * API-safe view: secret values are replaced with `isSet` so the UI can show
 * "configured" without ever receiving the credential.
 */
function redact(entries = []) {
  return (entries || []).map((raw) => {
    const entry = plain(raw);
    if (!entry?.key) return null;
    return entry.secret
      ? { key: entry.key, secret: true, isSet: Boolean(entry.value) }
      : { key: entry.key, secret: false, value: entry.value || '' };
  }).filter(Boolean);
}

module.exports = {
  KEY_ENV,
  KEY_RE,
  MAX_VARS,
  looksSecret,
  normalizeEnv,
  toObject,
  toEnvObject,
  redact,
};
