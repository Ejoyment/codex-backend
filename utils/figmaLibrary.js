const axios = require('axios');

async function figmaV2(accessToken, path) {
    const response = await axios({
        method: 'GET',
        url: `https://api.figma.com/v2${path}`,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
    });
    return response.data;
}

/**
 * Walk every team and folder the token can reach, returning a flat list of
 * files. Throws on discovery failure so the route can surface a real error.
 */
async function fetchAllFiles(accessToken) {
    const allFiles = [];
    const seen = new Set();

    const teams = await figmaV2(accessToken, '/teams');
    for (const team of teams.teams || []) {
        const stack = [{ id: team.id, name: team.name, type: 'team' }];
        while (stack.length) {
            const node = stack.pop();

            if (node.type === 'team') {
                const folders = await figmaV2(accessToken, `/teams/${node.id}/folders`);
                stack.push(...(folders.folders || []).map(f => ({ id: f.id, name: f.name, type: 'folder', parent: node.name })));
            } else {
                const files = await figmaV2(accessToken, `/folders/${node.id}/files`);
                for (const file of files.files || []) {
                    if (!file.key || seen.has(file.key)) continue;
                    seen.add(file.key);
                    allFiles.push({
                        key: file.key,
                        name: file.name || 'Untitled file',
                        thumbnail_url: file.thumbnail_url || null,
                        last_modified: file.last_modified || null,
                        folderName: node.parent || 'Files',
                    });
                }
                const children = await figmaV2(accessToken, `/folders/${node.id}/folders`);
                stack.push(...(children.folders || []).map(f => ({ id: f.id, name: f.name, type: 'folder', parent: node.name })));
            }
        }
    }

    return allFiles;
}

function describeFigmaError(error) {
    const status = error?.response?.status;
    const providerMessage = String(error?.response?.data?.message || error?.response?.data?.err || '');
    if (status === 403 && /scope/i.test(providerMessage)) {
        return { status: 403, code: 'FIGMA_SCOPE', message: 'Use a Personal Access Token to bypass scope limits.' };
    }
    if (status === 403) {
        return { status: 403, code: 'FIGMA_FORBIDDEN', message: 'Your Figma account cannot open that resource.' };
    }
    if (status === 404) {
        return { status: 404, code: 'FIGMA_NOT_FOUND', message: 'That Figma resource was not found.' };
    }
    if (status === 429) {
        return { status: 429, code: 'FIGMA_RATE_LIMITED', message: 'Figma is rate limiting requests. Try again in a minute.' };
    }
    return { status: 502, code: 'FIGMA_UNAVAILABLE', message: 'Could not reach Figma. Try again.' };
}

module.exports = {
    fetchAllFiles,
    describeFigmaError,
};
