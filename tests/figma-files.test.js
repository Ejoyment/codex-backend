/**
 * Figma file listing + helper sync.
 *
 * Figma's REST API cannot enumerate the files a user can open, so the Buildrs
 * browser helper reads the user's own Figma recent files and posts them to
 * `POST /api/figma/files/sync`. Listing must never 500 (which blanked the
 * Figma page with "Something went wrong").
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
const { parseFigmaFileKey } = figmaRouter;

const app = express();
app.use(express.json());
app.use('/api/figma', figmaRouter);

function makeIntegration({ metadata = new Map(), expiresAt = null } = {}) {
    return {
        accessToken: 'figma-token',
        expiresAt,
        metadata,
        save: jest.fn(async function save() { return this; }),
    };
}

function axiosError(status) {
    const error = new Error(`Figma ${status}`);
    error.response = { status, data: { message: 'provider error' } };
    return error;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('parseFigmaFileKey', () => {
    test.each([
        'https://www.figma.com/file/abcdefghijklmnopqrstuv/Design-System',
        'https://www.figma.com/design/abcdefghijklmnopqrstuv/Design-System?node-id=1-2',
        'https://figma.com/board/abcdefghijklmnopqrstuv/Board',
        'https://www.figma.com/proto/abcdefghijklmnopqrstuv/Prototype?starting-point=node',
        'https://www.figma.com/slides/abcdefghijklmnopqrstuv/Deck',
        'abcdefghijklmnopqrstuv',
    ])('extracts the key from %s', (input) => {
        expect(parseFigmaFileKey(input)).toBe('abcdefghijklmnopqrstuv');
    });

    test.each([
        '',
        '   ',
        'not a key',
        'short',
        'https://www.figma.com/team/123/Team',
        'https://www.figma.com/community/file/1234567890',
    ])('rejects %p', (input) => {
        expect(parseFigmaFileKey(input)).toBeNull();
    });
});

describe('GET /api/figma/files', () => {
    test('reports a disconnected account without failing', async () => {
        Integration.findOne.mockResolvedValue(null);

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            connected: false,
            files: [],
            helperSyncedAt: null,
        });
    });

    test('returns helper-synced files without calling Figma again', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaFiles', [{
                    key: 'savedfilekey1234567890',
                    name: 'Saved design',
                    thumbnail_url: 'https://cdn.figma.com/thumb.png',
                    last_modified: '2026-11-01T12:00:00Z',
                    source: 'helper',
                }]],
                ['helperSyncedAt', '2026-11-02T09:00:00.000Z'],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.files).toEqual([
            {
                key: 'savedfilekey1234567890',
                name: 'Saved design',
                thumbnail_url: 'https://cdn.figma.com/thumb.png',
                last_modified: '2026-11-01T12:00:00Z',
                source: 'helper',
            },
        ]);
        expect(response.body.helperSyncedAt).toBe('2026-11-02T09:00:00.000Z');
        expect(axios).not.toHaveBeenCalled();
    });

    test('drops malformed stored entries instead of trusting the snapshot', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaFiles', [
                    { key: 'validkey123456789012', name: 'Valid' },
                    { key: 'bad key!', name: 'Invalid' },
                    { name: 'No key' },
                    null,
                ]],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.files).toHaveLength(1);
        expect(response.body.files[0].key).toBe('validkey123456789012');
    });

    test('an empty snapshot answers with helper guidance instead of calling Figma', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files).toEqual([]);
        expect(response.body.message).toMatch(/figma helper/i);
        expect(axios).not.toHaveBeenCalled();
    });

    test('a storage failure returns an actionable empty list, not a 500', async () => {
        Integration.findOne.mockRejectedValue(new Error('db offline'));

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files).toEqual([]);
        expect(response.body.message).toMatch(/helper/i);
    });
});

describe('POST /api/figma/files/sync', () => {
    test('stores sanitized, deduped helper files and the sync timestamp', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app)
            .post('/api/figma/files/sync')
            .send({
                files: [
                    {
                        key: 'abcdefghijklmnopqrstuv',
                        name: '  Marketing site  ',
                        thumbnail_url: 'https://cdn.figma.com/thumb.png',
                        last_modified: '2026-11-01T12:00:00Z',
                    },
                    { key: 'abcdefghijklmnopqrstuv', name: 'Duplicate key' },
                    { key: 'bad key!', name: 'Invalid key' },
                    { key: 'secondkey1234567890', name: 'Second design', thumbnail_url: 'javascript:alert(1)' },
                ],
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files).toEqual([
            {
                key: 'abcdefghijklmnopqrstuv',
                name: 'Marketing site',
                thumbnail_url: 'https://cdn.figma.com/thumb.png',
                last_modified: '2026-11-01T12:00:00Z',
                source: 'helper',
            },
            {
                key: 'secondkey1234567890',
                name: 'Second design',
                thumbnail_url: null,
                last_modified: null,
                source: 'helper',
            },
        ]);
        expect(integration.metadata.get('figmaFiles')).toEqual(response.body.files);
        expect(integration.metadata.get('helperSyncedAt')).toEqual(expect.any(String));
        expect(integration.save).toHaveBeenCalled();
        expect(axios).not.toHaveBeenCalled();
    });

    test('replaces the previous snapshot on every sync', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaFiles', [{ key: 'oldkey1234567890123', name: 'Old design', source: 'helper' }]],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app)
            .post('/api/figma/files/sync')
            .send({ files: [{ key: 'newkey1234567890123', name: 'New design' }] });

        expect(response.status).toBe(200);
        expect(response.body.files.map((file) => file.key)).toEqual(['newkey1234567890123']);
        expect(integration.metadata.get('figmaFiles').map((file) => file.key)).toEqual(['newkey1234567890123']);
    });

    test('caps the snapshot at 200 files', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        const files = Array.from({ length: 205 }, (_, index) => ({ key: `file${index}`, name: `File ${index}` }));

        const response = await request(app).post('/api/figma/files/sync').send({ files });

        expect(response.status).toBe(200);
        expect(response.body.files).toHaveLength(200);
    });

    test('rejects a payload without a files array', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());

        const response = await request(app)
            .post('/api/figma/files/sync')
            .send({ files: 'nope' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/files list/i);
    });

    test('rejects syncing when Figma is not connected', async () => {
        Integration.findOne.mockResolvedValue(null);

        const response = await request(app)
            .post('/api/figma/files/sync')
            .send({ files: [] });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/connect figma/i);
    });
});

describe('GET /api/figma/files/:fileKey/frames', () => {
    test('lists pages and top-level frames with thumbnails', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        axios
            .mockResolvedValueOnce({
                data: {
                    name: 'App',
                    thumbnailUrl: 'file-thumb.png',
                    document: {
                        children: [
                            {
                                id: '0:1',
                                type: 'CANVAS',
                                name: 'Screens',
                                children: [
                                    { id: '1:2', type: 'FRAME', name: 'Home', absoluteBoundingBox: { width: 1440, height: 900 } },
                                    { id: '1:3', type: 'TEXT', name: 'Loose note' },
                                ],
                            },
                        ],
                    },
                },
            })
            .mockResolvedValueOnce({ data: { images: { '1:2': 'https://cdn/home.png' } } });

        const response = await request(app).get('/api/figma/files/abcdefghijklmnopqrstuv/frames');

        expect(response.status).toBe(200);
        expect(response.body.file).toEqual(expect.objectContaining({ key: 'abcdefghijklmnopqrstuv', name: 'App' }));
        expect(response.body.pages).toEqual([
            {
                id: '0:1',
                name: 'Screens',
                frames: [{ id: '1:2', name: 'Home', type: 'FRAME', width: 1440, height: 900, thumbnailUrl: 'https://cdn/home.png' }],
            },
        ]);
        expect(axios).toHaveBeenNthCalledWith(1, expect.objectContaining({
            url: 'https://api.figma.com/v1/files/abcdefghijklmnopqrstuv?depth=2',
        }));
    });

    test('still returns frames when thumbnails fail', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios
            .mockResolvedValueOnce({
                data: { name: 'App', document: { children: [{ id: '0:1', type: 'CANVAS', name: 'P', children: [{ id: '1:2', type: 'FRAME', name: 'Home' }] }] } },
            })
            .mockRejectedValueOnce(axiosError(500));

        const response = await request(app).get('/api/figma/files/abcdefghijklmnopqrstuv/frames');

        expect(response.status).toBe(200);
        expect(response.body.pages[0].frames[0]).toEqual(expect.objectContaining({ id: '1:2', thumbnailUrl: null }));
    });

    test('reports missing access as 403', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValueOnce(axiosError(403));

        const response = await request(app).get('/api/figma/files/abcdefghijklmnopqrstuv/frames');

        expect(response.status).toBe(403);
    });
});
