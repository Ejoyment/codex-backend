/**
 * Figma file import/listing.
 *
 * Figma no longer exposes a user's teams from `/v1/me`, so the file picker
 * cannot discover files automatically. Files are imported from a pasted link
 * and stored on the integration. Listing must never 500 (which blanked the
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
        expect(response.body).toEqual({ success: true, connected: false, files: [] });
    });

    test('returns saved files without calling Figma again', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaFiles', [{ key: 'savedfilekey1234567890', name: 'Saved design', thumbnail_url: null }]],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.files).toEqual([
            {
                key: 'savedfilekey1234567890',
                name: 'Saved design',
                thumbnail_url: null,
                last_modified: null,
                addedAt: null,
                source: 'link',
                selection: [],
                pushedAt: null,
            },
        ]);
        expect(axios).not.toHaveBeenCalled();
    });

    test('an empty library answers with guidance instead of calling Figma', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files).toEqual([]);
        expect(response.body.message).toMatch(/paste a figma file link/i);
        expect(axios).not.toHaveBeenCalled();
    });

});

describe('POST /api/figma/files', () => {
    test('imports a file from a pasted link', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        axios.mockResolvedValue({
            data: {
                name: 'Marketing site',
                lastModified: '2026-11-01T12:00:00Z',
                thumbnailUrl: 'https://cdn.figma.com/thumb.png',
            },
        });

        const response = await request(app)
            .post('/api/figma/files')
            .send({ url: 'https://www.figma.com/design/abcdefghijklmnopqrstuv/Marketing?node-id=0-1' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.file).toEqual({
            key: 'abcdefghijklmnopqrstuv',
            name: 'Marketing site',
            thumbnail_url: 'https://cdn.figma.com/thumb.png',
            last_modified: '2026-11-01T12:00:00Z',
            addedAt: expect.any(String),
            source: 'link',
            selection: [],
            pushedAt: null,
        });
        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://api.figma.com/v1/files/abcdefghijklmnopqrstuv?depth=1',
        }));
        expect(integration.metadata.get('figmaFiles')).toHaveLength(1);
        expect(integration.save).toHaveBeenCalled();
    });

    test('accepts a raw file key and dedupes repeat imports', async () => {
        const integration = makeIntegration({
            metadata: new Map([
                ['figmaFiles', [{ key: 'abcdefghijklmnopqrstuv', name: 'Old name', thumbnail_url: null }]],
            ]),
        });
        Integration.findOne.mockResolvedValue(integration);
        axios.mockResolvedValue({ data: { name: 'New name' } });

        const response = await request(app)
            .post('/api/figma/files')
            .send({ fileKey: 'abcdefghijklmnopqrstuv' });

        expect(response.status).toBe(200);
        expect(response.body.files).toHaveLength(1);
        expect(response.body.files[0].name).toBe('New name');
    });

    test('rejects a non-file link', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());

        const response = await request(app)
            .post('/api/figma/files')
            .send({ url: 'https://www.figma.com/team/123/Team' });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/paste a figma file link/i);
        expect(axios).not.toHaveBeenCalled();
    });

    test('reports missing access as 403', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValue(axiosError(403));

        const response = await request(app)
            .post('/api/figma/files')
            .send({ fileKey: 'abcdefghijklmnopqrstuv' });

        expect(response.status).toBe(403);
        expect(response.body.message).toMatch(/does not have access/i);
    });

    test('reports a missing file as 404', async () => {
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValue(axiosError(404));

        const response = await request(app)
            .post('/api/figma/files')
            .send({ fileKey: 'abcdefghijklmnopqrstuv' });

        expect(response.status).toBe(404);
        expect(response.body.message).toMatch(/was not found/i);
    });
});

describe('GET /api/figma/files/:fileKey/frames', () => {
    test('lists pages and top-level frames with thumbnails and saves the file', async () => {
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
        expect(integration.metadata.get('figmaFiles')[0]).toEqual(expect.objectContaining({ key: 'abcdefghijklmnopqrstuv', name: 'App' }));
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

describe('Figma plugin', () => {
    const USER_ID = '507f1f77bcf86cd799439011';

    async function pairedIntegration() {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        const response = await request(app).post('/api/figma/plugin/token');
        expect(response.status).toBe(200);
        return { integration, token: response.body.token };
    }

    test('generates a token and stores only its hash', async () => {
        const { integration, token } = await pairedIntegration();

        expect(token).toMatch(new RegExp(`^bfp_${USER_ID}_[A-Za-z0-9_-]{32,}$`));
        const storedHash = integration.metadata.get('pluginTokenHash');
        expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify([...integration.metadata.entries()])).not.toContain(token);
    });

    test('rejects a malformed or unknown token', async () => {
        await pairedIntegration();

        const malformed = await request(app).get('/api/figma/plugin/me').set('Authorization', 'Bearer nope');
        expect(malformed.status).toBe(401);

        const forged = await request(app)
            .get('/api/figma/plugin/me')
            .set('Authorization', `Bearer bfp_${USER_ID}_${'x'.repeat(43)}`);
        expect(forged.status).toBe(401);
    });

    test('a rotated token invalidates the previous one', async () => {
        const { token: first } = await pairedIntegration();
        await request(app).post('/api/figma/plugin/token');

        const response = await request(app).get('/api/figma/plugin/me').set('Authorization', `Bearer ${first}`);
        expect(response.status).toBe(401);
    });

    test('push saves the file and selected frames', async () => {
        const { integration, token } = await pairedIntegration();
        axios.mockResolvedValueOnce({ data: { name: 'Checkout', thumbnailUrl: 'thumb.png' } });

        const response = await request(app)
            .post('/api/figma/plugin/push')
            .set('Authorization', `Bearer ${token}`)
            .send({
                fileUrl: 'https://www.figma.com/design/abcdefghijklmnopqrstuv/Checkout',
                selection: [{ id: '12:34', name: 'Payment', type: 'FRAME', pageId: '0:1', pageName: 'Flows' }, { id: 'bogus' }],
            });

        expect(response.status).toBe(200);
        expect(response.body.file).toEqual(expect.objectContaining({
            key: 'abcdefghijklmnopqrstuv',
            name: 'Checkout',
            source: 'plugin',
            selection: [{ id: '12:34', name: 'Payment', type: 'FRAME', pageId: '0:1', pageName: 'Flows' }],
        }));
        expect(integration.metadata.get('figmaFiles')).toHaveLength(1);
        expect(integration.metadata.get('pluginLastPushAt')).toEqual(expect.any(String));
    });

    test('push asks for the file link when the plugin has no file key', async () => {
        const { token } = await pairedIntegration();

        const response = await request(app)
            .post('/api/figma/plugin/push')
            .set('Authorization', `Bearer ${token}`)
            .send({ selection: [] });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('FILE_KEY_REQUIRED');
        expect(axios).not.toHaveBeenCalled();
    });

    test('revoking the token disconnects the plugin', async () => {
        const { token } = await pairedIntegration();
        await request(app).delete('/api/figma/plugin/token');

        const response = await request(app).get('/api/figma/plugin/me').set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(401);
    });
});
