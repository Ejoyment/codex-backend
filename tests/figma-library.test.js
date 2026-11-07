/**
 * Figma team/folder library (folders:read): link a team or folder once and
 * every folder, subfolder and file in it is listed for the user.
 */
const express = require('express');
const request = require('supertest');

jest.mock('axios', () => {
    const mock = jest.fn();
    mock.post = jest.fn();
    mock.get = jest.fn();
    return mock;
});

jest.mock('../models/Integration');
jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    },
}));

const axios = require('axios');
const Integration = require('../models/Integration');
const figmaRouter = require('../routes/figma-api');
const { parseFigmaSourceUrl, fetchTeamLibrary, describeFigmaError } = require('../utils/figmaLibrary');

const app = express();
app.use(express.json());
app.use('/api/figma', figmaRouter);

function makeIntegration({ metadata = new Map(), scopes = ['current_user:read', 'file_content:read', 'folders:read'] } = {}) {
    return {
        accessToken: 'figma-token',
        expiresAt: null,
        scopes,
        metadata,
        save: jest.fn(async function save() { return this; }),
    };
}

function axiosError(status, message = 'provider error') {
    const error = new Error(`Figma ${status}`);
    error.response = { status, data: { message } };
    return error;
}

// Fake Figma v2 folder API for one team:
//   Design (folder 10) → files A, B; subfolder Archive (11) → file C
//   Marketing (folder 20) → file D
const TREE = {
    '/v2/teams/999/folders': { name: 'Acme', folders: [{ id: '10', name: 'Design', parent_folder_id: null }, { id: '20', name: 'Marketing', parent_folder_id: null }] },
    '/v2/folders/10/files': { name: 'Design', files: [{ key: 'fileAAAAAAAAAA', name: 'App', thumbnail_url: 'a.png', last_modified: '2026-11-01T00:00:00Z' }, { key: 'fileBBBBBBBBBB', name: 'Site' }] },
    '/v2/folders/10/folders': { name: 'Design', folders: [{ id: '11', name: 'Archive', parent_folder_id: '10' }] },
    '/v2/folders/11/files': { name: 'Archive', files: [{ key: 'fileCCCCCCCCCC', name: 'Old app' }] },
    '/v2/folders/11/folders': { name: 'Archive', folders: [] },
    '/v2/folders/20/files': { name: 'Marketing', files: [{ key: 'fileDDDDDDDDDD', name: 'Campaign' }] },
    '/v2/folders/20/folders': { name: 'Marketing', folders: [] },
};

function serveTree(overrides = {}) {
    axios.mockImplementation(async ({ url }) => {
        const path = url.replace('https://api.figma.com', '');
        if (overrides[path]) throw overrides[path];
        if (!TREE[path]) throw axiosError(404);
        return { data: TREE[path] };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    axios.mockReset();
    figmaRouter._libraryCache.clear();
});

describe('parseFigmaSourceUrl', () => {
    test.each([
        ['https://www.figma.com/files/team/1535685101263221741/Acme', { type: 'team', id: '1535685101263221741' }],
        ['https://www.figma.com/files/181033233908053158/team/1535685101263221741', { type: 'team', id: '1535685101263221741' }],
        ['https://www.figma.com/files/project/123456789/Design', { type: 'folder', id: '123456789' }],
        ['https://www.figma.com/files/181033233908053158/project/123456789', { type: 'folder', id: '123456789' }],
        ['https://www.figma.com/files/181033233908053158/folder/123456789', { type: 'folder', id: '123456789' }],
        ['1535685101263221741', { type: 'team', id: '1535685101263221741' }],
    ])('%s', (input, expected) => {
        expect(parseFigmaSourceUrl(input)).toEqual(expected);
    });

    test.each(['', 'https://www.figma.com/design/abcdefghijklmnop/App', 'not a link', '123'])('rejects %p', (input) => {
        expect(parseFigmaSourceUrl(input)).toBeNull();
    });
});

describe('fetchTeamLibrary', () => {
    test('walks every folder and subfolder', async () => {
        serveTree();

        const library = await fetchTeamLibrary('token', '999');

        expect(library.name).toBe('Acme');
        expect(library.fileCount).toBe(4);
        expect(library.truncated).toBe(false);
        expect(library.folders.map((folder) => folder.name)).toEqual(['Design', 'Marketing']);
        const [design] = library.folders;
        expect(design.files.map((file) => file.name)).toEqual(['App', 'Site']);
        expect(design.files[0]).toEqual(expect.objectContaining({ key: 'fileAAAAAAAAAA', thumbnail_url: 'a.png', folderId: '10', folderName: 'Design' }));
        expect(design.folders[0]).toEqual(expect.objectContaining({ name: 'Archive', files: [expect.objectContaining({ name: 'Old app' })] }));
    });

    test('stops at the folder limit and reports truncation', async () => {
        serveTree();

        const library = await fetchTeamLibrary('token', '999', { maxFolders: 2 });

        expect(library.truncated).toBe(true);
        expect(library.folders.map((folder) => folder.name)).toEqual(['Design', 'Marketing']);
        expect(library.folders[0].folders).toEqual([]);
    });

    test('a failing folder keeps the rest of the tree', async () => {
        serveTree({ '/v2/folders/20/files': axiosError(403) });

        const library = await fetchTeamLibrary('token', '999');

        expect(library.folders[1]).toEqual(expect.objectContaining({ name: 'Marketing', files: [], error: expect.any(String) }));
        expect(library.fileCount).toBe(3);
    });
});

describe('describeFigmaError', () => {
    test('maps a missing scope to a reconnect hint', () => {
        expect(describeFigmaError(axiosError(403, 'Invalid scope(s): folders:read'))).toEqual(expect.objectContaining({ code: 'FIGMA_SCOPE', status: 403 }));
        expect(describeFigmaError(axiosError(403))).toEqual(expect.objectContaining({ code: 'FIGMA_FORBIDDEN' }));
        expect(describeFigmaError(axiosError(404))).toEqual(expect.objectContaining({ code: 'FIGMA_NOT_FOUND' }));
    });
});

describe('library routes', () => {
    test('POST /library/sources links a team and returns its tree', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        serveTree();

        const response = await request(app)
            .post('/api/figma/library/sources')
            .send({ url: 'https://www.figma.com/files/team/999/Acme' });

        expect(response.status).toBe(200);
        expect(response.body.source).toEqual(expect.objectContaining({ type: 'team', id: '999', name: 'Acme', fileCount: 4 }));
        expect(integration.metadata.get('figmaSources')).toEqual([
            { type: 'team', id: '999', name: 'Acme', addedAt: expect.any(String) },
        ]);
    });

    test('POST /library/sources rejects a file link', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());

        const response = await request(app)
            .post('/api/figma/library/sources')
            .send({ url: 'https://www.figma.com/design/abcdefghijklmnop/App' });

        expect(response.status).toBe(400);
        expect(axios).not.toHaveBeenCalled();
    });

    test('POST /library/sources explains a missing folders:read grant', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValue(axiosError(403, 'Invalid scope(s)'));

        const response = await request(app)
            .post('/api/figma/library/sources')
            .send({ url: 'https://www.figma.com/files/team/999/Acme' });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('FIGMA_SCOPE');
        expect(response.body.message).toMatch(/reconnect figma/i);
    });

    test('GET /library returns linked teams and added files, cached between calls', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaSources', [{ type: 'team', id: '999', name: 'Acme', addedAt: '2026-11-07T00:00:00Z' }]],
                ['figmaFiles', [{ key: 'linkedfile12345', name: 'Draft' }]],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);
        serveTree();

        const first = await request(app).get('/api/figma/library');
        const callsAfterFirst = axios.mock.calls.length;
        const second = await request(app).get('/api/figma/library');

        expect(first.status).toBe(200);
        expect(first.body.needsReconnect).toBe(false);
        expect(first.body.sources[0]).toEqual(expect.objectContaining({ id: '999', name: 'Acme', fileCount: 4 }));
        expect(first.body.linkedFiles).toEqual([expect.objectContaining({ key: 'linkedfile12345' })]);
        expect(second.body.sources[0].fileCount).toBe(4);
        expect(axios.mock.calls.length).toBe(callsAfterFirst);

        await request(app).get('/api/figma/library?refresh=1');
        expect(axios.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    test('GET /library flags connections made without folders:read', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration({ scopes: [] }));

        const response = await request(app).get('/api/figma/library');

        expect(response.status).toBe(200);
        expect(response.body.needsReconnect).toBe(true);
    });

    test('GET /library reports a broken source without failing the page', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration({
            metadata: new Map([['figmaSources', [{ type: 'team', id: '999', name: 'Acme' }]]]),
        }));
        axios.mockRejectedValue(axiosError(403));

        const response = await request(app).get('/api/figma/library');

        expect(response.status).toBe(200);
        expect(response.body.sources[0]).toEqual(expect.objectContaining({ id: '999', errorCode: 'FIGMA_FORBIDDEN', fileCount: 0 }));
    });

    test('GET /library when disconnected', async () => {
        Integration.findOne.mockResolvedValue(null);

        const response = await request(app).get('/api/figma/library');

        expect(response.body).toEqual({ success: true, connected: false, sources: [], linkedFiles: [] });
    });

    test('DELETE /library/sources/:type/:id unlinks a team', async () => {
        const integration = makeIntegration({
            metadata: new Map([['figmaSources', [{ type: 'team', id: '999', name: 'Acme' }, { type: 'folder', id: '5', name: 'X' }]]]),
        });
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app).delete('/api/figma/library/sources/team/999');

        expect(response.status).toBe(200);
        expect(integration.metadata.get('figmaSources')).toEqual([{ type: 'folder', id: '5', name: 'X' }]);
    });
});
