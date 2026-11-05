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
    shouldSkipPath,
    PROVISIONING_LIMITS
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

    test('skips dependency, binary, and secret paths', () => {
        expect(shouldSkipPath('node_modules/react/index.js')).toBe(true);
        expect(shouldSkipPath('src/.env.production')).toBe(true);
        expect(shouldSkipPath('assets/logo.png')).toBe(true);
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
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('ready');
        expect(result.provisionedFileCount).toBe(2);
        const operations = CodeFile.bulkWrite.mock.calls[0][0];
        expect(operations.map((operation) => operation.updateOne.filter.path)).toEqual(['/src', '/']);
        expect(project.githubRepoName).toBe('acme/widgets');
        expect(project.save).toHaveBeenCalled();
    });

    test('rejects repositories whose tree is truncated', async () => {
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
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('failed');
        expect(result.provisioningError).toContain('too large');
        expect(CodeFile.bulkWrite).not.toHaveBeenCalled();
    });

    test('rejects repositories above the file limit', async () => {
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
                return {
                    tree: Array.from({ length: PROVISIONING_LIMITS.maxFiles + 1 }, (_, index) => ({
                        path: `src/file-${index}.js`,
                        type: 'blob',
                        sha: `blob-${index}`,
                        size: 10
                    }))
                };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await provisionProject(project._id, project.userId);

        expect(result.provisioningStatus).toBe('failed');
        expect(CodeFile.bulkWrite).not.toHaveBeenCalled();
    });

    test('does not reprovision an already ready project on retry', async () => {
        const project = projectFixture({ provisioningStatus: 'ready' });
        LocalProject.findById.mockResolvedValue(project);

        const result = await retryProvisioning(project._id, project.userId);

        expect(result).toBe(project);
        expect(LocalProject.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
