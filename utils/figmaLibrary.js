/**
 * Figma folder library: every folder, subfolder and file under a team (or a
 * single folder) the user linked, read with the user's `folders:read` token.
 *
 * Figma exposes no "list my teams" API, so a team/folder link is the entry
 * point; from there the whole tree is discovered and kept in sync.
 */
const axios = require('axios');

const TEAM_URL_RE = /figma\.com\/files\/(?:\d+\/)?team\/(\d+)/i;
const FOLDER_URL_RE = /figma\.com\/files\/(?:\d+\/)?(?:project|folder)\/(\d+)/i;

const DEFAULT_LIMITS = { maxFolders: 120, maxDepth: 4, concurrency: 4 };

// Accepts a team page link, a folder (project) link, or a raw numeric team id.
function parseFigmaSourceUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const folder = raw.match(FOLDER_URL_RE);
    if (folder) return { type: 'folder', id: folder[1] };
    const team = raw.match(TEAM_URL_RE);
    if (team) return { type: 'team', id: team[1] };
    if (/^\d{6,}$/.test(raw)) return { type: 'team', id: raw };
    return null;
}

async function figmaV2(accessToken, path) {
    const response = await axios({
        method: 'GET',
        url: `https://api.figma.com/v2${path}`,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
    });
    return response.data;
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

function toFile(file, folder) {
    return {
        key: file.key,
        name: file.name || 'Untitled file',
        thumbnail_url: file.thumbnail_url || null,
        last_modified: file.last_modified || null,
        folderId: folder.id,
        folderName: folder.name,
    };
}

/**
 * Breadth-first walk of folders. `roots` are `{ id, name, depth }` folder
 * stubs; returns a flat map of folders with their files and child ids.
 */
async function walkFolders(accessToken, roots, limits) {
    const folders = new Map();
    let frontier = roots.slice(0, limits.maxFolders);
    roots.slice(0, limits.maxFolders).forEach((root) => folders.set(root.id, { ...root, files: [], childIds: [] }));
    let truncated = roots.length > limits.maxFolders;

    while (frontier.length) {
        const discovered = [];
        await mapLimit(frontier, limits.concurrency, async (folder) => {
            const entry = folders.get(folder.id);
            const [filesResult, childrenResult] = await Promise.allSettled([
                figmaV2(accessToken, `/folders/${encodeURIComponent(folder.id)}/files`),
                folder.depth < limits.maxDepth
                    ? figmaV2(accessToken, `/folders/${encodeURIComponent(folder.id)}/folders`)
                    : Promise.resolve({ folders: [] }),
            ]);
            if (filesResult.status === 'fulfilled') {
                entry.files = (filesResult.value?.files || []).filter((file) => file?.key).map((file) => toFile(file, entry));
            } else {
                entry.error = describeFigmaError(filesResult.reason).message;
            }
            if (childrenResult.status === 'fulfilled') {
                for (const child of childrenResult.value?.folders || []) {
                    if (!child?.id || folders.has(child.id)) continue;
                    if (folders.size >= limits.maxFolders) {
                        truncated = true;
                        break;
                    }
                    const stub = { id: String(child.id), name: child.name || 'Untitled folder', parentId: folder.id, depth: folder.depth + 1 };
                    folders.set(stub.id, { ...stub, files: [], childIds: [] });
                    entry.childIds.push(stub.id);
                    discovered.push(stub);
                }
            }
        });
        frontier = discovered;
    }

    return { folders, truncated };
}

function buildTree(folderMap, ids) {
    return ids
        .map((id) => folderMap.get(id))
        .filter(Boolean)
        .map((folder) => ({
            id: folder.id,
            name: folder.name,
            files: folder.files,
            folders: buildTree(folderMap, folder.childIds),
            ...(folder.error ? { error: folder.error } : {}),
        }));
}

function countFiles(folders) {
    return folders.reduce((sum, folder) => sum + folder.files.length + countFiles(folder.folders), 0);
}

async function fetchTeamLibrary(accessToken, teamId, options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...options };
    const team = await figmaV2(accessToken, `/teams/${encodeURIComponent(teamId)}/folders`);
    const roots = (team?.folders || [])
        .filter((folder) => folder?.id)
        .map((folder) => ({ id: String(folder.id), name: folder.name || 'Untitled folder', parentId: null, depth: 1 }));
    const { folders, truncated } = await walkFolders(accessToken, roots, limits);
    const tree = buildTree(folders, roots.map((root) => root.id));
    return { type: 'team', id: String(teamId), name: team?.name || 'Figma team', folders: tree, fileCount: countFiles(tree), truncated };
}

async function fetchFolderLibrary(accessToken, folderId, options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...options };
    const meta = await figmaV2(accessToken, `/folders/${encodeURIComponent(folderId)}/files`);
    const root = { id: String(folderId), name: meta?.name || 'Figma folder', parentId: null, depth: 1 };
    const { folders, truncated } = await walkFolders(accessToken, [root], limits);
    const [tree] = buildTree(folders, [root.id]);
    return {
        type: 'folder',
        id: root.id,
        name: tree?.name || root.name,
        folders: tree?.folders || [],
        files: tree?.files || [],
        fileCount: tree ? countFiles([tree]) : 0,
        truncated,
    };
}

function fetchSourceLibrary(accessToken, source, options) {
    return source.type === 'folder'
        ? fetchFolderLibrary(accessToken, source.id, options)
        : fetchTeamLibrary(accessToken, source.id, options);
}

// Map Figma API failures to messages a user can act on.
function describeFigmaError(error) {
    const status = error?.response?.status;
    const providerMessage = String(error?.response?.data?.message || error?.response?.data?.err || '');
    if (status === 403 && /scope/i.test(providerMessage)) {
        return { status: 403, code: 'FIGMA_SCOPE', message: 'Figma did not grant folder access. Reconnect Figma to allow Buildrs to read your folders.' };
    }
    if (status === 403) {
        return { status: 403, code: 'FIGMA_FORBIDDEN', message: 'Your Figma account cannot open that team or folder. Check the link, or reconnect Figma with the account that has access.' };
    }
    if (status === 404) {
        return { status: 404, code: 'FIGMA_NOT_FOUND', message: 'That Figma team or folder was not found. Copy the link from the Figma file browser and try again.' };
    }
    if (status === 429) {
        return { status: 429, code: 'FIGMA_RATE_LIMITED', message: 'Figma is rate limiting requests. Try again in a minute.' };
    }
    return { status: 502, code: 'FIGMA_UNAVAILABLE', message: 'Could not reach Figma. Try again.' };
}

module.exports = {
    parseFigmaSourceUrl,
    fetchTeamLibrary,
    fetchFolderLibrary,
    fetchSourceLibrary,
    describeFigmaError,
    countFiles,
};
