/**
 * Figma OAuth scope regression tests.
 *
 * Figma deprecated `file_read` for OAuth 2 tokens. Requesting it against an app
 * configured with the current granular scopes makes the authorize endpoint
 * return `{"message":"Invalid scopes for app"}` before the user can consent.
 */
const fs = require('fs');
const path = require('path');

const {
    DEFAULT_FIGMA_SCOPES,
    getFigmaScopes,
    buildFigmaAuthorizeUrl
} = require('../utils/figmaOAuth');

const ORIGINAL_SCOPES = process.env.FIGMA_OAUTH_SCOPES;

afterEach(() => {
    if (ORIGINAL_SCOPES === undefined) delete process.env.FIGMA_OAUTH_SCOPES;
    else process.env.FIGMA_OAUTH_SCOPES = ORIGINAL_SCOPES;
});

describe('getFigmaScopes', () => {
    test('defaults to the core granular scopes', () => {
        delete process.env.FIGMA_OAUTH_SCOPES;

        expect(DEFAULT_FIGMA_SCOPES).toEqual(['current_user:read', 'file_content:read', 'folders:read']);
        expect(getFigmaScopes()).toEqual(['current_user:read', 'file_content:read', 'folders:read']);
    });

    test('accepts comma separated overrides', () => {
        process.env.FIGMA_OAUTH_SCOPES = 'file_content:read,current_user:read';

        expect(getFigmaScopes()).toEqual(['file_content:read', 'current_user:read']);
    });

    test('accepts space separated overrides and removes duplicates', () => {
        process.env.FIGMA_OAUTH_SCOPES = ' file_content:read  current_user:read file_content:read ';

        expect(getFigmaScopes()).toEqual(['file_content:read', 'current_user:read']);
    });

    test('ignores an empty override', () => {
        process.env.FIGMA_OAUTH_SCOPES = '   ';

        expect(getFigmaScopes()).toEqual(['current_user:read', 'file_content:read', 'folders:read']);
    });
});

describe('buildFigmaAuthorizeUrl', () => {
    test('encodes the redirect URI and sends the configured scopes', () => {
        delete process.env.FIGMA_OAUTH_SCOPES;

        const url = buildFigmaAuthorizeUrl({
            clientId: 'client-123',
            redirectUri: 'https://buildrshq.dev/api/integrations/figma/callback',
            state: 'signed-state'
        });
        const parsed = new URL(url);

        expect(parsed.origin).toBe('https://www.figma.com');
        expect(parsed.pathname).toBe('/oauth');
        expect(parsed.searchParams.get('client_id')).toBe('client-123');
        expect(parsed.searchParams.get('redirect_uri')).toBe(
            'https://buildrshq.dev/api/integrations/figma/callback'
        );
        expect(parsed.searchParams.get('scope')).toBe('current_user:read,file_content:read,folders:read');
        expect(parsed.searchParams.get('state')).toBe('signed-state');
        expect(parsed.searchParams.get('response_type')).toBe('code');
    });

    test('joins multiple scopes with commas', () => {
        const url = buildFigmaAuthorizeUrl({
            clientId: 'client-123',
            redirectUri: 'https://example.com/callback',
            state: 'state',
            scopes: ['file_content:read', 'current_user:read']
        });

        expect(new URL(url).searchParams.get('scope')).toBe('file_content:read,current_user:read');
    });

    test('adds PKCE parameters when a challenge is supplied', () => {
        const url = buildFigmaAuthorizeUrl({
            clientId: 'client-123',
            redirectUri: 'https://example.com/callback',
            state: 'state',
            codeChallenge: 'challenge'
        });
        const parsed = new URL(url);

        expect(parsed.searchParams.get('code_challenge')).toBe('challenge');
        expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    });
});

describe('routes use valid Figma scopes', () => {
    const root = path.join(__dirname, '..');
    const routes = ['routes/integrations.js', 'routes/figma-api.js'];

    test.each(routes)('%s does not request the deprecated file_read scope', (relative) => {
        const source = fs.readFileSync(path.join(root, relative), 'utf8');

        expect(source).not.toMatch(/file_read/);
    });

    test.each(routes)('%s builds the authorize URL through the shared helper', (relative) => {
        const source = fs.readFileSync(path.join(root, relative), 'utf8');

        expect(source).toMatch(/buildFigmaAuthorizeUrl/);
    });
});
