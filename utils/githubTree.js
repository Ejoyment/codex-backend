/**
 * GitHub repository tree listing that never gives up on big repositories.
 *
 * `GET /git/trees/:sha?recursive=1` truncates once a repository has too many
 * entries (GitHub's limit is ~100k entries / 7MB of JSON). Callers used to
 * treat `truncated: true` as "repository too large" and refuse the import.
 * Instead, fall back to walking the tree one directory level at a time, which
 * has no practical repository-size limit (one request per directory).
 */

const { githubAPI } = require('./githubApiClient');

const DEFAULT_CONCURRENCY = 8;

function treeEndpoint(owner, repo, sha, recursive) {
    const base = `/repos/${owner}/${repo}/git/trees/${sha}`;
    return recursive ? `${base}?recursive=1` : base;
}

async function mapWithConcurrency(items, limit, mapper) {
    let nextIndex = 0;
    const workers = Array.from(
        { length: Math.max(1, Math.min(limit, items.length)) },
        async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                await mapper(items[index], index);
            }
        }
    );
    await Promise.all(workers);
}

/**
 * Return every blob in a tree, recursively, without relying on GitHub's
 * recursive endpoint staying under its truncation limit.
 *
 * @returns {Promise<Array<{path: string, type: string, sha: string, size?: number, mode?: string}>>}
 */
async function listRepoTree(accessToken, owner, repo, treeSha, options = {}) {
    if (!treeSha) return [];
    const concurrency = Math.max(1, Number(options.concurrency) || DEFAULT_CONCURRENCY);

    const recursive = await githubAPI(
        accessToken,
        treeEndpoint(owner, repo, treeSha, true),
        'GET',
        null,
        { timeout: 60000 }
    ).catch((error) => {
        // GitHub can reject the recursive request outright for very large
        // trees instead of returning `truncated: true`. Fall through to the
        // directory walk either way; it is the only size-independent path.
        console.warn(`[github-tree] recursive listing failed (${error.message}); walking directories`);
        return null;
    });
    if (recursive && recursive.truncated !== true) {
        return (recursive.tree || []).filter((item) => item && item.path);
    }

    // Truncated (or GitHub omitted `truncated` on an odd response): walk the
    // tree breadth-first. Each request is one directory, so even enormous
    // monorepos eventually list completely.
    const blobs = [];
    const seenTrees = new Set();
    let level = [{ sha: treeSha, prefix: '' }];

    while (level.length) {
        const nextLevel = [];
        await mapWithConcurrency(level, concurrency, async ({ sha, prefix }) => {
            if (!sha || seenTrees.has(sha)) return;
            seenTrees.add(sha);

            const page = await githubAPI(
                accessToken,
                treeEndpoint(owner, repo, sha, false),
                'GET',
                null,
                { timeout: 60000 }
            );
            for (const item of page.tree || []) {
                if (!item || !item.path) continue;
                const fullPath = prefix ? `${prefix}/${item.path}` : item.path;
                if (item.type === 'tree') {
                    nextLevel.push({ sha: item.sha, prefix: fullPath });
                } else if (item.type === 'blob') {
                    blobs.push({ ...item, path: fullPath });
                }
            }
        });
        level = nextLevel;
    }

    return blobs;
}

module.exports = {
    listRepoTree,
};
