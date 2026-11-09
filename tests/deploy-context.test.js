const { normalizeDeployContext } = require('../utils/deployContext');

describe('normalizeDeployContext', () => {
    test('persists branch, environment, commit and build settings', () => {
        expect(normalizeDeployContext({
            branch: 'feature/auth-flow',
            environment: 'preview',
            commit: '8ea2f1c',
            framework: 'Vite',
            buildCommand: 'pnpm build',
            rootDirectory: './',
            outputDirectory: 'dist',
        }, { subdomain: 'my-app' })).toEqual({
            branch: 'feature/auth-flow',
            environment: 'Preview',
            commit: '8ea2f1c',
            framework: 'Vite',
            buildCommand: 'pnpm build',
            rootDirectory: './',
            outputDirectory: 'dist',
            region: null,
        });
    });

    test('normalises environment casing and aliases', () => {
        expect(normalizeDeployContext({ environment: 'PROD' }, {}).environment).toBe('Production');
        expect(normalizeDeployContext({ environment: 'staging' }, {}).environment).toBe('Preview');
    });

    test('defaults a new deployment to main / Production (Preview for preview subdomains)', () => {
        expect(normalizeDeployContext({}, { subdomain: 'my-app' }))
            .toMatchObject({ branch: 'main', environment: 'Production', commit: null });
        expect(normalizeDeployContext({}, { subdomain: 'my-app-preview' }).environment).toBe('Preview');
    });

    test('derives the branch from the repo or project when not supplied', () => {
        expect(normalizeDeployContext({ repo: { defaultBranch: 'develop' } }, {}).branch).toBe('develop');
        expect(normalizeDeployContext({}, { project: { defaultBranch: 'trunk' } }).branch).toBe('trunk');
    });

    test('preserves existing values on redeploy when fields are omitted', () => {
        const existing = { branch: 'release/1', environment: 'Preview', commit: 'abcdef1234567890' };
        expect(normalizeDeployContext({}, { existing, subdomain: 'my-app' }))
            .toMatchObject({ branch: 'release/1', environment: 'Preview', commit: 'abcdef1234567890' });
    });

    test('accepts latest as a commit placeholder', () => {
        expect(normalizeDeployContext({ commit: 'latest' }, {}).commit).toBe('latest');
    });

    test('rejects invalid branch, environment, commit, region and control characters', () => {
        expect(() => normalizeDeployContext({ branch: 'not a branch' }, {})).toThrow(/Invalid branch/);
        expect(() => normalizeDeployContext({ branch: 'a..b' }, {})).toThrow(/Invalid branch/);
        expect(() => normalizeDeployContext({ branch: 'a//b' }, {})).toThrow(/Invalid branch/);
        expect(() => normalizeDeployContext({ environment: 'qa' }, {})).toThrow(/Invalid environment/);
        expect(() => normalizeDeployContext({ commit: 'not-a-sha' }, {})).toThrow(/Invalid commit/);
        expect(() => normalizeDeployContext({ region: 'bad region!' }, {})).toThrow(/Invalid region/);
        expect(() => normalizeDeployContext({ buildCommand: 'npm run build\nrm -rf /' }, {})).toThrow(/Invalid build command/);
    });
});
