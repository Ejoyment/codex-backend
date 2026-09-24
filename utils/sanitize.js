const url = require('url');

function assertValidWorkspaceId(workspaceId) {
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new Error('Invalid workspaceId');
  }

  // Allow only alphanumeric, dashes, underscores
  const ok = /^[a-zA-Z0-9_\-]+$/.test(workspaceId);
  if (!ok) {
    throw new Error('Invalid workspaceId format');
  }
}

function assertValidRepoUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') {
    throw new Error('Invalid repoUrl');
  }

  // Basic allowlist: http(s) or git@ or ssh://
  const allowed = /^(https?:\/\/|git@|ssh:\/\/)/i.test(repoUrl);
  if (!allowed) {
    throw new Error('Unsupported repoUrl protocol');
  }

  // Disallow shell meta-characters to reduce risk of injection
  if (/[;&|`$<>]/.test(repoUrl)) {
    throw new Error('repoUrl contains invalid characters');
  }
}

// Patterns matching env var *names* that should never have their value
// shared by default. Matched case-insensitively against the key.
const SECRET_NAME_PATTERNS = [
  /_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /^SECRET/i,
  /^PASSWORD/i
];

function isSecretEnvName(name) {
  return SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Redact an environment variable map for Debug Room snapshot sharing.
 * Names matching a secret pattern are replaced with a placeholder; everything
 * else passes through. `explicitAllow` lets the host share one specific
 * variable's real value even if its name matches a secret pattern (the
 * "share a single variable" escape hatch from the Phase 3 spec).
 */
function redactEnvVars(envMap = {}, explicitAllow = []) {
  const allowSet = new Set(explicitAllow);
  const redacted = {};

  for (const [key, value] of Object.entries(envMap)) {
    if (allowSet.has(key)) {
      redacted[key] = value;
    } else if (isSecretEnvName(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

module.exports = {
  assertValidWorkspaceId,
  assertValidRepoUrl,
  isSecretEnvName,
  redactEnvVars
};
