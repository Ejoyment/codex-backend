/**
 * Figma OAuth helpers.
 *
 * Figma deprecated the old `file_read` scope for OAuth 2 tokens. Requesting it
 * against an app that only has the current granular scopes enabled fails at the
 * authorization step with:
 *
 *   {"error":true,"status":400,"message":"Invalid scopes for app","i18n":null}
 *
 * `files:read` is the legacy broad scope, but Figma no longer offers it in the
 * OAuth app scope picker for new apps. Default to the granular scopes this
 * integration needs: identify the connected user, read file contents/images,
 * and list folders and the files in them (the team/folder library). Every
 * default must be enabled on the Figma app, or authorization fails. Extra
 * feature scopes (versions, comments, components/styles) can be requested with
 * `FIGMA_OAUTH_SCOPES`, provided they are enabled on the Figma app too.
 */

const DEFAULT_FIGMA_SCOPES = ['current_user:read', 'file_content:read', 'folders:read'];

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
