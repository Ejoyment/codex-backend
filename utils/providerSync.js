/**
 * Real provider sync for connected integrations.
 *
 * The dashboard used to write invented repositories, messages and pages into
 * `IntegrationData` and report success. These fetchers call the provider APIs
 * with the stored token and return records shaped for that collection. When a
 * provider cannot be synced (missing scope, plan limitation, unknown platform)
 * the caller gets an explicit error instead of fabricated rows.
 */
const axios = require('axios');

const TIMEOUT_MS = 15000;

function providerError(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function unsupported(platform) {
    return providerError(501, 'PROVIDER_SYNC_UNSUPPORTED', `Syncing ${platform} is not supported yet`);
}

function networkFailure(platform, error) {
    const status = error?.response?.status;
    // Keep the provider payload server-side; only the shape is logged.
    console.error(`[provider-sync] ${platform} request failed:`, status || error.message);
    if (status === 401) return providerError(401, 'PROVIDER_TOKEN_REJECTED', `Reconnect ${platform}: the stored token was rejected`);
    if (status === 403) return providerError(403, 'PROVIDER_SCOPE_MISSING', `Reconnect ${platform}: the token is missing a required scope`);
    if (status === 404) return providerError(404, 'PROVIDER_RESOURCE_MISSING', `${platform} did not return that resource`);
    if (status === 429) return providerError(429, 'PROVIDER_RATE_LIMITED', `${platform} is rate limiting requests; try again shortly`);
    return providerError(502, 'PROVIDER_SYNC_FAILED', `Could not reach ${platform}`);
}

function record(platform, dataType, data, lastActivity = new Date()) {
    return {
        platform,
        dataType,
        data,
        lastSynced: new Date(),
        syncStatus: 'success',
        metadata: { totalItems: 1, unreadCount: 0, lastActivity },
    };
}

async function syncGithub(integration) {
    const token = integration.personalAccessToken || integration.accessToken;
    let response;
    try {
        response = await axios.get('https://api.github.com/user/repos', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'buildrs-sync',
            },
            params: { per_page: 20, sort: 'updated' },
            timeout: TIMEOUT_MS,
        });
    } catch (error) {
        throw networkFailure('GitHub', error);
    }
    const repos = Array.isArray(response.data) ? response.data : [];
    return repos.map((repo) => record('github', 'repositories', {
        name: repo.full_name,
        description: repo.description || '',
        private: Boolean(repo.private),
        stars: repo.stargazers_count || 0,
        language: repo.language || null,
        updated: repo.updated_at || null,
    }, repo.updated_at ? new Date(repo.updated_at) : new Date()));
}

async function syncFigma(integration) {
    let response;
    try {
        response = await axios.get('https://api.figma.com/v1/me', {
            headers: { Authorization: `Bearer ${integration.accessToken}` },
            timeout: TIMEOUT_MS,
        });
    } catch (error) {
        throw networkFailure('Figma', error);
    }
    const me = response.data || {};
    return [record('figma', 'profile', {
        id: me.id || null,
        handle: me.handle || null,
        email: me.email || null,
        avatarUrl: me.img_url || null,
    })];
}

async function syncDiscord(integration) {
    let response;
    try {
        response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${integration.accessToken}` },
            timeout: TIMEOUT_MS,
        });
    } catch (error) {
        throw networkFailure('Discord', error);
    }
    const guilds = Array.isArray(response.data) ? response.data : [];
    return guilds.map((guild) => record('discord', 'guilds', {
        id: guild.id,
        name: guild.name,
        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
        owner: Boolean(guild.owner),
        permissions: guild.permissions || null,
    }));
}

async function syncSlack(integration) {
    let response;
    try {
        response = await axios.get('https://slack.com/api/conversations.list', {
            headers: { Authorization: `Bearer ${integration.accessToken}` },
            params: { limit: 20, types: 'public_channel,private_channel' },
            timeout: TIMEOUT_MS,
        });
    } catch (error) {
        throw networkFailure('Slack', error);
    }
    if (!response.data?.ok) {
        const reason = String(response.data?.error || 'unknown_error');
        console.error('[provider-sync] slack error:', reason);
        throw providerError(502, 'PROVIDER_SYNC_FAILED', 'Slack rejected the request; reconnect the integration');
    }
    const channels = Array.isArray(response.data.channels) ? response.data.channels : [];
    return channels.map((channel) => record('slack', 'channels', {
        id: channel.id,
        name: channel.name,
        private: Boolean(channel.is_private),
        members: channel.num_members || 0,
    }));
}

async function syncNotion(integration) {
    let response;
    try {
        response = await axios.post('https://api.notion.com/v1/search', {
            page_size: 20,
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
        }, {
            headers: {
                Authorization: `Bearer ${integration.accessToken}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            timeout: TIMEOUT_MS,
        });
    } catch (error) {
        throw networkFailure('Notion', error);
    }
    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    return results.map((item) => record('notion', 'pages', {
        id: item.id,
        title: item.properties?.title?.title?.[0]?.plain_text
            || item.properties?.Name?.title?.[0]?.plain_text
            || 'Untitled',
        url: item.url || null,
        lastEdited: item.last_edited_time || null,
    }, item.last_edited_time ? new Date(item.last_edited_time) : new Date()));
}

const FETCHERS = {
    github: syncGithub,
    figma: syncFigma,
    discord: syncDiscord,
    slack: syncSlack,
    notion: syncNotion,
};

async function fetchPlatformData(integration) {
    const platform = integration?.provider;
    const fetcher = FETCHERS[platform];
    if (!fetcher) throw unsupported(platform || 'this platform');
    return fetcher(integration);
}

module.exports = {
    fetchPlatformData,
    SUPPORTED_PLATFORMS: Object.keys(FETCHERS),
};
