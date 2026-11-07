/**
 * Figma OAuth helpers.
 *
 * Figma deprecated the old `file_read` scope for OAuth 2 tokens. Requesting it
 * against an app that only has the current granular scopes enabled fails at the
 * authorization step with:
 *
 *   {"error":true,"status":400,"message":"Invalid scopes for app","i18n":null}
 *
 * `files:read` is the legacy broad scope that still covers every endpoint this
 * integration uses (`/v1/me`, `/v1/files`, `/v1/teams/:id/projects`, ...). Some
 * apps only have the granular scopes enabled, so deployments can set
 * `FIGMA_OAUTH_SCOPES` to the exact comma/space separated list configured on
 * the Figma app (for example `file_content:read,current_user:read`).
 */

const DEFAULT_FIGMA_SCOPES = ['files:read'];

function getFigmaScopes() {
    const raw = String(process.env.FIGMA_OAUTH_SCOPES || '').trim();
    const scopes = (raw || DEFAULT_FIGMA_SCOPES.join(','))
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean);

    return [...new Set(scopes)];
}

function buildFigmaAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    scopes = getFigmaScopes(),
    codeChallenge,
    codeChallengeMethod = 'S256'
}) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(','),
        state,
        response_type: 'code'
    });

    if (codeChallenge) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', codeChallengeMethod);
    }

    return `https://www.figma.com/oauth?${params.toString()}`;
}

module.exports = {
    DEFAULT_FIGMA_SCOPES,
    getFigmaScopes,
    buildFigmaAuthorizeUrl
};
