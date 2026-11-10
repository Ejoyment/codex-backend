const { githubAPI } = require('./githubApiClient');

const DEFAULT_STALE_DAYS = 30;
const CACHE_TTL_MS = 60 * 1000;
const REPO_META_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function readCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function writeCache(key, value, ttl = CACHE_TTL_MS) {
    cache.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
}

async function cached(key, ttl, loader) {
    const cachedValue = readCache(key);
    if (cachedValue !== null) return cachedValue;
    const value = await loader();
    return writeCache(key, value, ttl);
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await mapper(items[index], index);
        }
    }

    const workers = Array.from(
        { length: Math.min(Math.max(limit, 1), items.length) },
        () => worker()
    );
    await Promise.all(workers);
    return results;
}

function branchAgeDays(lastCommitAt, now = Date.now()) {
    if (!lastCommitAt) return null;
    const timestamp = new Date(lastCommitAt).getTime();
    if (Number.isNaN(timestamp)) return null;
    return Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1000));
}

function branchStatus({ isProtected, lastCommitAt, staleAfterDays = DEFAULT_STALE_DAYS }, now = Date.now()) {
    if (isProtected) return 'protected';
    const age = branchAgeDays(lastCommitAt, now);
    return age !== null && age > staleAfterDays ? 'stale' : 'active';
}

function firstLine(value) {
    return String(value || '').split('\n')[0].trim();
}

function mapBranchSummary(branch, { defaultBranch, compare, commit, staleAfterDays, now } = {}) {
    const lastCommit = commit
        ? {
            sha: commit.sha,
            message: firstLine(commit.commit?.message),
            authorName: commit.commit?.author?.name || commit.author?.login || '',
            authorLogin: commit.author?.login || '',
            authorAvatar: commit.author?.avatar_url || '',
            date: commit.commit?.author?.date || commit.commit?.committer?.date || null,
            url: commit.html_url || '',
        }
        : null;

    return {
        name: branch.name,
        protected: Boolean(branch.protected),
        commit: {
            sha: branch.commit?.sha,
            url: branch.commit?.url,
        },
        defaultBranch: Boolean(defaultBranch && branch.name === defaultBranch),
        ahead: Number(compare?.ahead_by || 0),
        behind: Number(compare?.behind_by || 0),
        status: branchStatus({
            isProtected: branch.protected,
            lastCommitAt: lastCommit?.date,
            staleAfterDays,
        }, now),
        lastCommit,
    };
}

function normalizeChecks(status) {
    if (!status || !status.state) {
        return { state: 'none', total: 0, passing: 0, failing: 0, pending: 0, url: '' };
    }

    const statuses = Array.isArray(status.statuses) ? status.statuses : [];
    const total = Number(status.total_count || statuses.length || 0);
    const passing = statuses.filter((item) => item.state === 'success').length;
    const failing = statuses.filter((item) => item.state === 'failure' || item.state === 'error').length;
    const pending = statuses.filter((item) => item.state === 'pending').length;
    const state = status.state === 'success'
        ? 'success'
        : status.state === 'pending'
            ? 'pending'
            : 'failure';

    return {
        state: total > 0 ? state : 'none',
        total,
        passing,
        failing,
        pending,
        url: status.target_url || status.url || '',
    };
}

function mapPullRequestSummary(pr, checks) {
    const merged = Boolean(pr.merged_at);
    return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: merged ? 'merged' : pr.state,
        draft: Boolean(pr.draft),
        mergedAt: pr.merged_at || null,
        closedAt: pr.closed_at || null,
        user: pr.user?.login || '',
        userAvatar: pr.user?.avatar_url || '',
        head: pr.head?.ref || '',
        base: pr.base?.ref || '',
        headSha: pr.head?.sha || '',
        baseSha: pr.base?.sha || '',
        labels: (pr.labels || []).map((label) => ({
            name: label.name,
            color: label.color,
            description: label.description,
        })),
        additions: Number(pr.additions || 0),
        deletions: Number(pr.deletions || 0),
        changedFiles: Number(pr.changed_files || 0),
        commitCount: Number(pr.commits || 0),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        url: pr.html_url,
        mergeable: pr.mergeable,
        checks: normalizeChecks(checks),
    };
}

async function getRepoMeta(accessToken, owner, repo) {
    return cached(`repo-meta:${owner}/${repo}`, REPO_META_TTL_MS, () => (
        githubAPI(accessToken, `/repos/${owner}/${repo}`)
    ));
}

async function getBranchSummary(accessToken, owner, repo, branch, defaultBranch) {
    const cacheKey = `branch:${owner}/${repo}:${branch.name}:${defaultBranch || ''}`;
    return cached(cacheKey, CACHE_TTL_MS, async () => {
        const comparePromise = defaultBranch && branch.name !== defaultBranch
            ? githubAPI(
                accessToken,
                `/repos/${owner}/${repo}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch.name)}`
            ).catch(() => null)
            : Promise.resolve(null);
        const commitPromise = branch.commit?.sha
            ? githubAPI(accessToken, `/repos/${owner}/${repo}/commits/${branch.commit.sha}`).catch(() => null)
            : Promise.resolve(null);

        const [compare, commit] = await Promise.all([comparePromise, commitPromise]);
        return { compare, commit };
    });
}

async function enrichBranches(accessToken, owner, repo, branches, options = {}) {
    const {
        defaultBranch = 'main',
        limit = 40,
        staleAfterDays = DEFAULT_STALE_DAYS,
        maxConcurrency = 6,
        now = Date.now(),
    } = options;

    return mapWithConcurrency(branches.slice(0, limit), maxConcurrency, async (branch) => {
        try {
            const summary = await getBranchSummary(accessToken, owner, repo, branch, defaultBranch);
            return mapBranchSummary(branch, { defaultBranch, staleAfterDays, now, ...summary });
        } catch (error) {
            return mapBranchSummary(branch, { defaultBranch, staleAfterDays, now });
        }
    });
}

async function getPullChecks(accessToken, owner, repo, sha) {
    if (!sha) return null;
    return cached(`checks:${owner}/${repo}:${sha}`, CACHE_TTL_MS, () => (
        githubAPI(accessToken, `/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null)
    ));
}

async function getPullDetails(accessToken, owner, repo, number) {
    return cached(`pull:${owner}/${repo}:${number}`, CACHE_TTL_MS, () => (
        githubAPI(accessToken, `/repos/${owner}/${repo}/pulls/${number}`).catch(() => null)
    ));
}

async function enrichPullRequests(accessToken, owner, repo, pulls, options = {}) {
    const {
        includeChecks = false,
        includeDetails = true,
        limit = 50,
        maxConcurrency = 6,
    } = options;

    return mapWithConcurrency(pulls.slice(0, limit), maxConcurrency, async (pr) => {
        const detailsPromise = includeDetails
            ? getPullDetails(accessToken, owner, repo, pr.number)
            : Promise.resolve(null);
        const checksPromise = includeChecks
            ? getPullChecks(accessToken, owner, repo, pr.head?.sha)
            : Promise.resolve(null);

        const [details, checks] = await Promise.all([detailsPromise, checksPromise]);
        return mapPullRequestSummary(details ? { ...pr, ...details } : pr, checks);
    });
}

function clearGitHubOverviewCache() {
    cache.clear();
}

module.exports = {
    DEFAULT_STALE_DAYS,
    branchAgeDays,
    branchStatus,
    normalizeChecks,
    mapBranchSummary,
    mapPullRequestSummary,
    enrichBranches,
    enrichPullRequests,
    getRepoMeta,
    clearGitHubOverviewCache,
};
