const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const simpleGitModule = require('simple-git');
const simpleGit = typeof simpleGitModule === 'function'
  ? simpleGitModule
  : (simpleGitModule.simpleGit || simpleGitModule.default || simpleGitModule);
const gitService = require('../utils/gitService');

describe('git service working-tree paths', () => {
  let workspaceId;
  let workspacePath;

  beforeEach(async () => {
    workspaceId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-git-path-test-'));
    gitService.workspacePaths.set(workspaceId, workspacePath);
  });

  afterEach(async () => {
    gitService.workspacePaths.delete(workspaceId);
    gitService.repositories.delete(workspaceId);
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  test('stages and commits valid AI-generated paths containing route groups and spaces', async () => {
    const git = simpleGit(workspacePath);
    await git.init();
    await git.addConfig('user.name', 'Test Agent');
    await git.addConfig('user.email', 'agent@example.test');
    await fs.writeFile(path.join(workspacePath, 'README.md'), 'base');
    await git.add('README.md');
    await git.commit('base commit');
    await git.checkoutLocalBranch('feature/agent');
    gitService.repositories.set(workspaceId, git);

    const write = await gitService.writeWorkingTree(workspaceId, [{
      path: 'src/app/(auth)/my profile/page.tsx',
      action: 'create',
      content: 'export default function Page() {}',
    }]);
    const staged = await gitService.commitWorkingTree(workspaceId, 'Agent changes', 'feature/agent');

    expect(write).toEqual({ success: true, written: 1 });
    expect(staged).toMatchObject({ success: true, branch: 'feature/agent' });
    await expect(git.show(['feature/agent:src/app/(auth)/my profile/page.tsx']))
      .resolves.toBe('export default function Page() {}');
    await expect(
      fs.readFile(path.join(workspacePath, 'src/app/(auth)/my profile/page.tsx'), 'utf8')
    ).resolves.toBe('export default function Page() {}');
  });

  test('rejects paths that escape the working tree', async () => {
    const result = await gitService.writeWorkingTree(workspaceId, [{
      path: '../outside.js',
      action: 'create',
      content: 'should not be written',
    }]);

    expect(result).toMatchObject({ success: false, error: 'Invalid path' });
    await expect(fs.access(path.join(path.dirname(workspacePath), 'outside.js'))).rejects.toThrow();
  });
});
