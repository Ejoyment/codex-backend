jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

describe('GitHub recursive repository file listing', () => {
  test('lists only files recursively from the selected branch tree', async () => {
    const service = require('../utils/githubService');
    const githubClient = {
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getBranch: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'branch-sha' } },
        }),
      },
      git: {
        getTree: jest.fn().mockResolvedValue({
          data: {
            truncated: false,
            tree: [
              { path: 'src', type: 'tree', sha: 'tree-sha' },
              { path: 'src/index.js', type: 'blob', size: 20, sha: 'file-sha' },
            ],
          },
        }),
      },
    };
    service.clients.set('user-id', githubClient);

    const result = await service.listRepositoryFiles('user-id', 'owner', 'repo', 'main');

    expect(githubClient.repos.getBranch).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
    });
    expect(githubClient.git.getTree).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      tree_sha: 'branch-sha',
      recursive: '1',
    });
    expect(result).toEqual({
      branch: 'main',
      truncated: false,
      totalFiles: 1,
      files: [{
        name: 'index.js',
        path: 'src/index.js',
        type: 'file',
        size: 20,
        sha: 'file-sha',
      }],
    });
    service.clients.delete('user-id');
  });

  test('marks GitHub-truncated trees without claiming a total file count', async () => {
    const service = require('../utils/githubService');
    const githubClient = {
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getBranch: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'branch-sha' } },
        }),
      },
      git: {
        getTree: jest.fn().mockResolvedValue({
          data: {
            truncated: true,
            tree: [{ path: 'README.md', type: 'blob', sha: 'readme-sha' }],
          },
        }),
      },
    };
    service.clients.set('user-id', githubClient);

    const result = await service.listRepositoryFiles('user-id', 'owner', 'repo');

    expect(result).toMatchObject({
      branch: 'main',
      truncated: true,
      totalFiles: null,
      files: [{ path: 'README.md' }],
    });
    service.clients.delete('user-id');
  });
});
