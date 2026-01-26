const { Octokit } = require('@octokit/rest');
const Integration = require('../models/Integration');

class GitHubService {
    constructor() {
        this.clients = new Map(); // Cache Octokit clients per user
    }

    async getClient(userId) {
        // Check cache first
        if (this.clients.has(userId)) {
            return this.clients.get(userId);
        }

        // Get user's GitHub integration
        const integration = await Integration.findOne({
            userId,
            provider: 'github',
            isActive: true
        });

        if (!integration || !integration.accessToken) {
            throw new Error('GitHub not connected. Please connect GitHub in settings.');
        }

        // Create Octokit client
        const octokit = new Octokit({
            auth: integration.accessToken
        });

        // Cache it
        this.clients.set(userId, octokit);

        return octokit;
    }

    async listRepositories(userId) {
        try {
            const octokit = await this.getClient(userId);
            
            const { data } = await octokit.repos.listForAuthenticatedUser({
                sort: 'updated',
                per_page: 100
            });

            return data.map(repo => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                private: repo.private,
                description: repo.description,
                language: repo.language,
                defaultBranch: repo.default_branch,
                updatedAt: repo.updated_at,
                url: repo.html_url
            }));
        } catch (error) {
            console.error('GitHub list repos error:', error);
            throw new Error('Failed to list repositories: ' + error.message);
        }
    }

    async getRepository(userId, owner, repo) {
        try {
            const octokit = await this.getClient(userId);
            
            const { data } = await octokit.repos.get({
                owner,
                repo
            });

            return {
                id: data.id,
                name: data.name,
                fullName: data.full_name,
                owner: data.owner.login,
                private: data.private,
                description: data.description,
                language: data.language,
                defaultBranch: data.default_branch,
                updatedAt: data.updated_at
            };
        } catch (error) {
            console.error('GitHub get repo error:', error);
            throw new Error('Failed to get repository: ' + error.message);
        }
    }

    async listFiles(userId, owner, repo, path = '', branch = null) {
        try {
            const octokit = await this.getClient(userId);
            
            const params = {
                owner,
                repo,
                path
            };

            if (branch) {
                params.ref = branch;
            }

            const { data } = await octokit.repos.getContent(params);

            if (Array.isArray(data)) {
                return data.map(item => ({
                    name: item.name,
                    path: item.path,
                    type: item.type,
                    size: item.size,
                    sha: item.sha,
                    url: item.html_url
                }));
            } else {
                // Single file
                return [{
                    name: data.name,
                    path: data.path,
                    type: data.type,
                    size: data.size,
                    sha: data.sha,
                    url: data.html_url
                }];
            }
        } catch (error) {
            console.error('GitHub list files error:', error);
            throw new Error('Failed to list files: ' + error.message);
        }
    }

    async getFileContent(userId, owner, repo, path, branch = null) {
        try {
            const octokit = await this.getClient(userId);
            
            const params = {
                owner,
                repo,
                path
            };

            if (branch) {
                params.ref = branch;
            }

            const { data } = await octokit.repos.getContent(params);

            if (data.type !== 'file') {
                throw new Error('Path is not a file');
            }

            // Decode base64 content
            const content = Buffer.from(data.content, 'base64').toString('utf-8');

            return {
                path: data.path,
                content,
                sha: data.sha,
                size: data.size,
                encoding: data.encoding
            };
        } catch (error) {
            console.error('GitHub get file error:', error);
            throw new Error('Failed to get file content: ' + error.message);
        }
    }

    async createOrUpdateFile(userId, owner, repo, path, content, message, branch = null, sha = null) {
        try {
            const octokit = await this.getClient(userId);
            
            const params = {
                owner,
                repo,
                path,
                message,
                content: Buffer.from(content).toString('base64')
            };

            if (branch) {
                params.branch = branch;
            }

            if (sha) {
                params.sha = sha; // Required for updates
            }

            const { data } = await octokit.repos.createOrUpdateFileContents(params);

            return {
                commit: {
                    sha: data.commit.sha,
                    message: data.commit.message,
                    url: data.commit.html_url
                },
                content: {
                    sha: data.content.sha,
                    path: data.content.path
                }
            };
        } catch (error) {
            console.error('GitHub create/update file error:', error);
            throw new Error('Failed to create/update file: ' + error.message);
        }
    }

    async deleteFile(userId, owner, repo, path, message, branch = null) {
        try {
            const octokit = await this.getClient(userId);
            
            // Get file SHA first
            const file = await this.getFileContent(userId, owner, repo, path, branch);
            
            const params = {
                owner,
                repo,
                path,
                message,
                sha: file.sha
            };

            if (branch) {
                params.branch = branch;
            }

            const { data } = await octokit.repos.deleteFile(params);

            return {
                commit: {
                    sha: data.commit.sha,
                    message: data.commit.message
                }
            };
        } catch (error) {
            console.error('GitHub delete file error:', error);
            throw new Error('Failed to delete file: ' + error.message);
        }
    }

    async createBranch(userId, owner, repo, newBranch, fromBranch = 'main') {
        try {
            const octokit = await this.getClient(userId);
            
            // Get the SHA of the branch to branch from
            const { data: refData } = await octokit.git.getRef({
                owner,
                repo,
                ref: `heads/${fromBranch}`
            });

            // Create new branch
            const { data } = await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${newBranch}`,
                sha: refData.object.sha
            });

            return {
                ref: data.ref,
                sha: data.object.sha
            };
        } catch (error) {
            console.error('GitHub create branch error:', error);
            throw new Error('Failed to create branch: ' + error.message);
        }
    }

    async createPullRequest(userId, owner, repo, title, head, base, body = '') {
        try {
            const octokit = await this.getClient(userId);
            
            const { data } = await octokit.pulls.create({
                owner,
                repo,
                title,
                head,
                base,
                body
            });

            return {
                number: data.number,
                title: data.title,
                url: data.html_url,
                state: data.state
            };
        } catch (error) {
            console.error('GitHub create PR error:', error);
            throw new Error('Failed to create pull request: ' + error.message);
        }
    }

    async listBranches(userId, owner, repo) {
        try {
            const octokit = await this.getClient(userId);
            
            const { data } = await octokit.repos.listBranches({
                owner,
                repo,
                per_page: 100
            });

            return data.map(branch => ({
                name: branch.name,
                protected: branch.protected,
                commit: {
                    sha: branch.commit.sha,
                    url: branch.commit.url
                }
            }));
        } catch (error) {
            console.error('GitHub list branches error:', error);
            throw new Error('Failed to list branches: ' + error.message);
        }
    }

    clearCache(userId) {
        this.clients.delete(userId);
    }
}

module.exports = new GitHubService();
