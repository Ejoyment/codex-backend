const axios = require('axios');
const Integration = require('../models/Integration');

async function getGitHubIntegration(userId) {
    const integration = await Integration.findOne({
        userId,
        provider: 'github',
        isActive: true
    });

    if (!integration) {
        const error = new Error('GitHub not connected');
        error.code = 'GITHUB_NOT_CONNECTED';
        throw error;
    }

    return integration;
}

async function githubAPI(accessToken, endpoint, method = 'GET', data = null, options = {}) {
    try {
        const response = await axios({
            method,
            url: `https://api.github.com${endpoint}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'CODEX-INC-App'
            },
            data,
            timeout: options.timeout || 20000
        });
        return response.data;
    } catch (error) {
        console.error('GitHub API error:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    getGitHubIntegration,
    githubAPI
};
