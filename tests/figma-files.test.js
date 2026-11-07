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
            { key: 'savedfilekey1234567890', name: 'Saved design', thumbnail_url: null, last_modified: null, addedAt: null },
        ]);
        expect(axios).not.toHaveBeenCalled();
    });

    test('never 500s when discovery fails', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        axios.mockRejectedValue(axiosError(403));

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files).toEqual([]);
        expect(response.body.message).toMatch(/paste a figma file link/i);
    });

    test('saves files found through legacy team discovery', async () => {
        const integration = makeIntegration();
        Integration.findOne.mockResolvedValue(integration);
        axios
            .mockResolvedValueOnce({ data: { id: 'u1', teams: [{ id: 'team-1' }] } })
            .mockResolvedValueOnce({ data: { projects: [{ id: 'project-1' }] } })
            .mockResolvedValueOnce({
                data: { files: [{ key: 'discovered1234567890', name: 'Discovered', thumbnailUrl: 'thumb.png' }] },
            });

        const response = await request(app).get('/api/figma/files');

        expect(response.status).toBe(200);
        expect(response.body.files).toEqual([
            {
                key: 'discovered1234567890',
                name: 'Discovered',
                thumbnail_url: 'thumb.png',
                last_modified: null,
                addedAt: expect.any(String),
            },
        ]);
        expect(integration.save).toHaveBeenCalled();
        expect(integration.metadata.get('figmaFiles')).toHaveLength(1);
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
