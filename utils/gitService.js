/**
 * Git Service - Version Control Integration
 * Provides Git operations for workspace repositories
 */

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class GitService {
  constructor() {
    this.repositories = new Map(); // workspaceId -> git instance
    this.workspacePaths = new Map(); // workspaceId -> path
  }

  /**
   * Get or create git instance for workspace
   */
  async getGit(workspaceId) {
    if (this.repositories.has(workspaceId)) {
      return this.repositories.get(workspaceId);
    }

    // Create workspace directory
    const workspacePath = path.join(os.tmpdir(), 'codex-git', workspaceId);
    await fs.mkdir(workspacePath, { recursive: true });

    const git = simpleGit(workspacePath);
    this.repositories.set(workspaceId, git);
    this.workspacePaths.set(workspaceId, workspacePath);

    return git;
  }

  /**
   * Initialize Git repository
   */
  async init(workspaceId, options = {}) {
    try {
      const git = await this.getGit(workspaceId);
      await git.init();

      // Set default config
      await git.addConfig('user.name', options.userName || 'CODEX User');
      await git.addConfig('user.email', options.userEmail || 'user@codex.dev');

      return { success: true, message: 'Repository initialized' };
    } catch (error) {
      console.error('Git init error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get repository status
   */
  async status(workspaceId) {
    try {
      const git = await this.getGit(workspaceId);
      const status = await git.status();

      return {
        success: true,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        staged: status.staged,
        conflicted: status.conflicted,
        isClean: status.isClean()
      };
    } catch (error) {
      console.error('Git status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file diff
   */
  async diff(workspaceId, file = null) {
    try {
      const git = await this.getGit(workspaceId);
      const diffText = file ? await git.diff([file]) : await git.diff();

      const parsed = this.parseDiff(diffText);

      return {
        success: true,
        diff: diffText,
        parsed: parsed
      };
    } catch (error) {
      console.error('Git diff error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse unified diff format
   */
  parseDiff(diffText) {
    if (!diffText) return [];

    const files = [];
    const lines = diffText.split('\n');
    let currentFile = null;
    let currentHunk = null;

    lines.forEach(line => {
      if (line.startsWith('diff --git')) {
        if (currentFile) files.push(currentFile);
        const match = line.match(/diff --git a\/(.*) b\/(.*)/);
        currentFile = {
          oldPath: match ? match[1] : '',
          newPath: match ? match[2] : '',
          hunks: []
        };
        currentHunk = null;
      } else if (line.startsWith('@@')) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
        currentHunk = {
          oldStart: match ? parseInt(match[1]) : 0,
          oldLines: match ? parseInt(match[2] || '1') : 1,
          newStart: match ? parseInt(match[3]) : 0,
          newLines: match ? parseInt(match[4] || '1') : 1,
          header: match ? match[5].trim() : '',
          changes: []
        };
      } else if (currentHunk) {
        if (line.startsWith('+')) {
          currentHunk.changes.push({ type: 'add', content: line.substring(1) });
        } else if (line.startsWith('-')) {
          currentHunk.changes.push({ type: 'remove', content: line.substring(1) });
        } else if (line.startsWith(' ')) {
          currentHunk.changes.push({ type: 'context', content: line.substring(1) });
        }
      }
    });

    if (currentHunk) currentFile.hunks.push(currentHunk);
    if (currentFile) files.push(currentFile);

    return files;
  }

  /**
   * Stage files
   */
  async add(workspaceId, files) {
    try {
      const git = await this.getGit(workspaceId);
      await git.add(files);

      return { success: true, message: 'Files staged' };
    } catch (error) {
      console.error('Git add error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unstage files
   */
  async reset(workspaceId, files) {
    try {
      const git = await this.getGit(workspaceId);
      await git.reset(['HEAD', ...files]);

      return { success: true, message: 'Files unstaged' };
    } catch (error) {
      console.error('Git reset error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Commit changes
   */
  async commit(workspaceId, message, files = null) {
    try {
      const git = await this.getGit(workspaceId);

      if (files) {
        await git.add(files);
      }

      const result = await git.commit(message);

      return {
        success: true,
        commit: result.commit,
        summary: result.summary,
        branch: result.branch
      };
    } catch (error) {
      console.error('Git commit error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get commit log
   */
  async log(workspaceId, options = {}) {
    try {
      const git = await this.getGit(workspaceId);
      const log = await git.log({
        maxCount: options.limit || 50,
        file: options.file
      });

      return {
        success: true,
        commits: log.all.map(commit => ({
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          author: commit.author_name,
          email: commit.author_email
        }))
      };
    } catch (error) {
      console.error('Git log error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List branches
   */
  async branches(workspaceId) {
    try {
      const git = await this.getGit(workspaceId);
      const branches = await git.branchLocal();

      return {
        success: true,
        current: branches.current,
        branches: branches.all,
        details: branches.branches
      };
    } catch (error) {
      console.error('Git branches error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create new branch
   */
  async createBranch(workspaceId, branchName) {
    try {
      const git = await this.getGit(workspaceId);
      await git.checkoutLocalBranch(branchName);

      return { success: true, branch: branchName };
    } catch (error) {
      console.error('Git create branch error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Switch branch
   */
  async checkout(workspaceId, branchName) {
    try {
      const git = await this.getGit(workspaceId);
      await git.checkout(branchName);

      return { success: true, branch: branchName };
    } catch (error) {
      console.error('Git checkout error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge branch
   */
  async merge(workspaceId, branchName) {
    try {
      const git = await this.getGit(workspaceId);
      const result = await git.merge([branchName]);

      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Git merge error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull from remote
   */
  async pull(workspaceId, remote = 'origin', branch = null) {
    try {
      const git = await this.getGit(workspaceId);
      const result = branch 
        ? await git.pull(remote, branch)
        : await git.pull();

      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Git pull error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Push to remote
   */
  async push(workspaceId, remote = 'origin', branch = null) {
    try {
      const git = await this.getGit(workspaceId);
      const result = branch
        ? await git.push(remote, branch)
        : await git.push();

      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Git push error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add remote
   */
  async addRemote(workspaceId, name, url) {
    try {
      const git = await this.getGit(workspaceId);
      await git.addRemote(name, url);

      return { success: true, message: `Remote '${name}' added` };
    } catch (error) {
      console.error('Git add remote error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List remotes
   */
  async remotes(workspaceId) {
    try {
      const git = await this.getGit(workspaceId);
      const remotes = await git.getRemotes(true);

      return {
        success: true,
        remotes: remotes.map(r => ({
          name: r.name,
          fetch: r.refs.fetch,
          push: r.refs.push
        }))
      };
    } catch (error) {
      console.error('Git remotes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clone repository
   */
  async clone(workspaceId, repoUrl, options = {}) {
    try {
      const workspacePath = path.join(os.tmpdir(), 'codex-git', workspaceId);
      await fs.mkdir(workspacePath, { recursive: true });

      const git = simpleGit();
      await git.clone(repoUrl, workspacePath, options.args || []);

      const newGit = simpleGit(workspacePath);
      this.repositories.set(workspaceId, newGit);
      this.workspacePaths.set(workspaceId, workspacePath);

      return { success: true, message: 'Repository cloned' };
    } catch (error) {
      console.error('Git clone error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file at specific commit
   */
  async show(workspaceId, commitHash, filePath) {
    try {
      const git = await this.getGit(workspaceId);
      const content = await git.show([`${commitHash}:${filePath}`]);

      return {
        success: true,
        content: content
      };
    } catch (error) {
      console.error('Git show error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stash changes
   */
  async stash(workspaceId, message = null) {
    try {
      const git = await this.getGit(workspaceId);
      const result = message
        ? await git.stash(['save', message])
        : await git.stash();

      return { success: true, result: result };
    } catch (error) {
      console.error('Git stash error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Apply stash
   */
  async stashPop(workspaceId) {
    try {
      const git = await this.getGit(workspaceId);
      const result = await git.stash(['pop']);

      return { success: true, result: result };
    } catch (error) {
      console.error('Git stash pop error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up workspace
   */
  async cleanup(workspaceId) {
    try {
      const workspacePath = this.workspacePaths.get(workspaceId);
      if (workspacePath) {
        await fs.rm(workspacePath, { recursive: true, force: true });
      }

      this.repositories.delete(workspaceId);
      this.workspacePaths.delete(workspaceId);

      return { success: true, message: 'Workspace cleaned up' };
    } catch (error) {
      console.error('Git cleanup error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
const gitService = new GitService();

module.exports = gitService;
