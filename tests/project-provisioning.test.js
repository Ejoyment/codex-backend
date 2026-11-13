jest.mock('../models/LocalProject');
jest.mock('../models/CodeFile');
jest.mock('../utils/virtualFileSystem', () => ({
    invalidateIndex: jest.fn()
}));
jest.mock('../utils/personalWorkspace', () => ({
    ensurePersonalWorkspace: jest.fn()
}));
jest.mock('../utils/githubApiClient', () => ({
    getGitHubIntegration: jest.fn(),
    githubAPI: jest.fn()
}));

const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const vfs = require('../utils/virtualFileSystem');
const { getGitHubIntegration, githubAPI } = require('../utils/githubApiClient');
const {
    provisionProject,
    retryProvisioning,
    normalizeRepoName,
    normalizeBranch,
    shouldSkipPath
} = require('../utils/projectProvisioningService');

function projectFixture(overrides = {}) {
    return {
        _id: '507f1f77bcf86cd799439021',
        userId: '507f1f77bcf86cd799439011',
        workspaceId: '507f1f77bcf86cd799439012',
        name: 'Provisioning test',
        description: 'A test project',
        sourceType: 'scratch',
        template: '',
        githubRepoName: '',
        githubRepoUrl: '',
        defaultBranch: 'main',
        technologies: ['Node.js'],
        intelligence: { starterSpec: true },
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides
    };
}

function mockReadyProject(project) {
    LocalProject.findOneAndUpdate.mockResolvedValue(project);
    LocalProject.findByIdAndUpdate.mockImplementation(async (_id, update) => ({
        ...project,
        ...update.$set
    }));
}

describe('project provisioning service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        CodeFile.bulkWrite.mockResolvedValue({});
    });

    test('normalizes GitHub repository URLs and shorthand names', () => {
        expect(normalizeRepoName('https://github.com/acme/widgets.git')).toMatchObject({
            owner: 'acme',
            repo: 'widgets',
            fullName: 'acme/widgets'
        });
        expect(normalizeRepoName('acme/widgets').fullName).toBe('acme/widgets');
        expect(() => normalizeRepoName('https://gitlab.com/acme/widgets')).toThrow();
        expect(() => normalizeRepoName('acme/widgets/extra')).toThrow();
    });

    test('validates branch names', () => {
        expect(normalizeBranch('feature/project-setup')).toBe('feature/project-setup');
        expect(() => normalizeBranch('../main')).toThrow();
        expect(() => normalizeBranch('main:prod')).toThrow();
    });

    test('skips dependency and secret paths but imports binary assets', () => {
        expect(shouldSkipPath('node_modules/react/index.js')).toBe(true);
        expect(shouldSkipPath('src/.env.production')).toBe(true);
        expect(shouldSkipPath('assets/logo.png')).toBe(false);
        expect(shouldSkipPath('dist/bundle.js')).toBe(false);
        expect(shouldSkipPath('src/index.js')).toBe(false);
        expect(shouldSkipPath('.env.example')).toBe(false);
    });

    test('provisions a scratch project with starter files', async () => {
        const project = projectFixture();
        mockReadyProject(project);

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        expect(result.provisionedFileCount).toBe(3);
        const operations = CodeFile.bulkWrite.mock.calls[0][0];
        expect(operations.map((operation) => operation.updateOne.filter.name)).toEqual([
            'README.md',
            '.gitignore',
            'SPEC.md'
        ]);
        expect(vfs.invalidateIndex).toHaveBeenCalledWith(project.workspaceId);
    });

    test('provisions a curated template', async () => {
        const project = projectFixture({
            sourceType: 'template',
            template: 'TypeScript API Service'
        });
        mockReadyProject(project);

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        const names = CodeFile.bulkWrite.mock.calls[0][0]
            .map((operation) => operation.updateOne.filter.name);
        expect(names).toEqual(expect.arrayContaining(['package.json', 'tsconfig.json', 'index.ts']));
    });

    test('marks an unsupported template as failed', async () => {
        const project = projectFixture({
            sourceType: 'template',
            template: 'Unsupported template'
        });
        mockReadyProject(project);

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('failed');
        expect(result.provisioningError).toContain('supported project template');
        expect(CodeFile.bulkWrite).not.toHaveBeenCalled();
    });

    test('imports text files from GitHub and skips unsafe paths', async () => {
        const project = projectFixture({
            sourceType: 'github',
            githubRepoName: 'acme/widgets',
            defaultBranch: 'main'
        });
        mockReadyProject(project);
        getGitHubIntegration.mockResolvedValue({ accessToken: 'token' });
        githubAPI.mockImplementation(async (_token, endpoint) => {
            if (endpoint === '/repos/acme/widgets') return { default_branch: 'main' };
            if (endpoint === '/repos/acme/widgets/git/ref/heads/main') {
                return { object: { sha: 'commit-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/commits/commit-sha') {
                return { tree: { sha: 'tree-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/trees/tree-sha?recursive=1') {
                return {
                    tree: [
                        { path: 'src/index.js', type: 'blob', sha: 'blob-index', size: 24 },
                        { path: 'README.md', type: 'blob', sha: 'blob-readme', size: 12 },
                        { path: 'node_modules/pkg/index.js', type: 'blob', sha: 'blob-skip', size: 5 },
                        { path: '.env', type: 'blob', sha: 'blob-secret', size: 5 },
                        { path: 'assets/logo.png', type: 'blob', sha: 'blob-image', size: 5 }
                    ]
                };
            }
            if (endpoint === '/repos/acme/widgets/git/blobs/blob-index') {
                return { encoding: 'base64', content: Buffer.from('console.log(1);\n').toString('base64') };
            }
            if (endpoint === '/repos/acme/widgets/git/blobs/blob-readme') {
                return { encoding: 'base64', content: Buffer.from('# Widgets\n').toString('base64') };
            }
            if (endpoint === '/repos/acme/widgets/git/blobs/blob-image') {
                return { encoding: 'base64', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]).toString('base64') };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        expect(result.provisionedFileCount).toBe(3);
        const operations = CodeFile.bulkWrite.mock.calls[0][0];
        expect(operations.map((operation) => operation.updateOne.filter.path)).toEqual(['/src', '/', '/assets']);
        const image = operations.find((operation) => operation.updateOne.filter.name === 'logo.png');
        expect(image.updateOne.update.$set.encoding).toBe('base64');
        expect(project.githubRepoName).toBe('acme/widgets');
        expect(project.save).toHaveBeenCalled();
    });

    test('walks a truncated tree instead of rejecting the repository', async () => {
        const project = projectFixture({
            sourceType: 'github',
            githubRepoName: 'acme/widgets'
        });
        mockReadyProject(project);
        getGitHubIntegration.mockResolvedValue({ accessToken: 'token' });
        githubAPI.mockImplementation(async (_token, endpoint) => {
            if (endpoint === '/repos/acme/widgets') return { default_branch: 'main' };
            if (endpoint === '/repos/acme/widgets/git/ref/heads/main') {
                return { object: { sha: 'commit-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/commits/commit-sha') {
                return { tree: { sha: 'tree-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/trees/tree-sha?recursive=1') {
                return { truncated: true, tree: [] };
            }
            // Non-recursive walk: root then one subdirectory.
            if (endpoint === '/repos/acme/widgets/git/trees/tree-sha') {
                return {
                    tree: [
                        { path: 'src', type: 'tree', sha: 'tree-src' },
                        { path: 'README.md', type: 'blob', sha: 'blob-readme', size: 12 }
                    ]
                };
            }
            if (endpoint === '/repos/acme/widgets/git/trees/tree-src') {
                return { tree: [{ path: 'index.js', type: 'blob', sha: 'blob-index', size: 24 }] };
            }
            if (endpoint === '/repos/acme/widgets/git/blobs/blob-index') {
                return { encoding: 'base64', content: Buffer.from('console.log(1);\n').toString('base64') };
            }
            if (endpoint === '/repos/acme/widgets/git/blobs/blob-readme') {
                return { encoding: 'base64', content: Buffer.from('# Widgets\n').toString('base64') };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        expect(result.provisionedFileCount).toBe(2);
        const names = CodeFile.bulkWrite.mock.calls
            .flatMap((call) => call[0])
            .map((operation) => operation.updateOne.filter.name);
        expect(names).toEqual(expect.arrayContaining(['index.js', 'README.md']));
    });

    test('imports repositories far above the old file limit', async () => {
        const project = projectFixture({
            sourceType: 'github',
            githubRepoName: 'acme/widgets'
        });
        mockReadyProject(project);
        getGitHubIntegration.mockResolvedValue({ accessToken: 'token' });
        const fileCount = 501;
        githubAPI.mockImplementation(async (_token, endpoint) => {
            if (endpoint === '/repos/acme/widgets') return { default_branch: 'main' };
            if (endpoint === '/repos/acme/widgets/git/ref/heads/main') {
                return { object: { sha: 'commit-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/commits/commit-sha') {
                return { tree: { sha: 'tree-sha' } };
            }
            if (endpoint === '/repos/acme/widgets/git/trees/tree-sha?recursive=1') {
                return {
                    tree: Array.from({ length: fileCount }, (_, index) => ({
                        path: `src/file-${index}.js`,
                        type: 'blob',
                        sha: `blob-${index}`,
                        size: 10
                    }))
                };
            }
            const blobMatch = endpoint.match(/\/git\/blobs\/blob-(\d+)$/);
            if (blobMatch) {
                return { encoding: 'base64', content: Buffer.from(`// ${blobMatch[1]}\n`).toString('base64') };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        expect(result.provisionedFileCount).toBe(fileCount);
    });

    test('does not reprovision an already ready project on retry', async () => {
        const project = projectFixture({ provisioningStatus: 'ready' });
        LocalProject.findById.mockResolvedValue(project);

        const result = await retryProvisioning(project._id, project.userId);

        expect(result).toBe(project);
        expect(LocalProject.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
