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

module.exports = {
  assertValidWorkspaceId,
  assertValidRepoUrl
};
