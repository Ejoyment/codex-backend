/**
 * Tamper-evident signatures for manually provisioned entitlements.
 *
 * The signature covers the entitlement identity, plan, provider, status,
 * currency, amount (minor units), and current period end. Manual provisioning
 * is the only writer of these signatures; webhook entitlements keep their
 * existing provider-verified flow untouched.
 */
const crypto = require('crypto');

const SIGNATURE_PREFIX = 'v1=';
const DOMAIN = 'buildrs-entitlement:v1\n';

function splitSecrets(value) {
  return String(value || '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
}

/**
 * Rotation order: sign with ENTITLEMENT_SIGNING_SECRET, keep verifying with
 * ENTITLEMENT_SIGNING_SECRET_PREVIOUS until all stored rows have been
 * re-signed. JWT_SECRET remains a migration fallback for old deployments.
 */
function signingSecrets() {
  const secrets = [
    ...splitSecrets(process.env.ENTITLEMENT_SIGNING_SECRET),
    ...splitSecrets(process.env.ENTITLEMENT_SIGNING_SECRET_PREVIOUS),
  ];
  const unique = [...new Set(secrets)];
  if (unique.length > 0) return unique;
  const fallback = String(process.env.JWT_SECRET || '').trim();
  if (fallback) return [fallback];
  throw new Error('Entitlement signing secret is not configured');
}

function signingSecret() {
  return signingSecrets()[0];
}

function toIsoString(value) {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function canonicalPayload(entitlement) {
  const source = entitlement || {};
  return DOMAIN + JSON.stringify({
    version: 1,
    userId: source.userId == null ? '' : String(source.userId),
    teamId: source.teamId == null ? '' : String(source.teamId),
    plan: source.plan == null ? '' : String(source.plan),
    provider: source.provider == null ? '' : String(source.provider),
    status: source.status == null ? '' : String(source.status),
    currency: source.currency == null ? '' : String(source.currency).toUpperCase(),
    amountMinor: source.amountMinor == null ? null : Number(source.amountMinor),
    currentPeriodEnd: toIsoString(source.currentPeriodEnd),
  });
}

function signEntitlement(entitlement) {
  const digest = crypto
    .createHmac('sha256', signingSecret())
    .update(canonicalPayload(entitlement))
    .digest('hex');
  return `${SIGNATURE_PREFIX}${digest}`;
}

function verifyEntitlementSignature(entitlement) {
  if (!entitlement || !entitlement.entitlementSignature) return false;
  let secrets;
  try {
    secrets = signingSecrets();
  } catch (error) {
    return false;
  }
  const actual = Buffer.from(String(entitlement.entitlementSignature));
  const payload = canonicalPayload(entitlement);
  return secrets.some((secret) => {
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const computed = Buffer.from(`${SIGNATURE_PREFIX}${digest}`);
    return actual.length === computed.length && crypto.timingSafeEqual(actual, computed);
  });
}

module.exports = {
  canonicalPayload,
  signEntitlement,
  verifyEntitlementSignature,
  signingSecrets,
};
