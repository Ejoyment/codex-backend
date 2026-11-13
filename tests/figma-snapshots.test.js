/**
 * Design snapshots pushed by the Buildrs Figma Helper.
 *
 * The helper reads frames with the user's own Figma session, so a snapshot is
 * enough for codegen and agent tasks — no Figma REST call and no OAuth file
 * scope involved.
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
jest.mock('../models/DesignToken');
jest.mock('../models/FigmaDesignSnapshot');
jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
        req.userId = '507f1f77bcf86cd799439011';
        next();
    },
}));
jest.mock('../utils/aiService', () => ({ chat: jest.fn() }));
jest.mock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));

const axios = require('axios');
const Integration = require('../models/Integration');
const DesignToken = require('../models/DesignToken');
const FigmaDesignSnapshot = require('../models/FigmaDesignSnapshot');
const aiService = require('../utils/aiService');
const figmaRouter = require('../routes/figma-api');
const designCodeRouter = require('../routes/design-code');
const { sanitizeNodePayload, saveDesignSnapshot } = require('../utils/figmaSnapshot');
const { getDesignContext } = require('../utils/figmaContextService');

const app = express();
app.use(express.json());
app.use('/api/figma', figmaRouter);
app.use('/api/design-code', designCodeRouter);

const FRAME = {
    id: '1:2',
    name: 'Hero',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 800 },
    layoutMode: 'VERTICAL',
    itemSpacing: 24,
    fills: [{ type: 'SOLID', color: { r: 0.05, g: 0.07, b: 0.1 } }],
    children: [
        {
            id: '1:3',
            name: 'Headline',
            type: 'TEXT',
            characters: 'Ship faster',
            style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 48, lineHeightPx: 56 },
            absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 56 },
            // Unknown fields must not be persisted.
            pluginData: { secret: 'drop me' },
        },
    ],
};

function makeIntegration({ token = 'figma-token' } = {}) {
    return {
        accessToken: token,
        expiresAt: null,
        metadata: new Map(),
        getFigmaToken: () => token,
        save: jest.fn(async function save() { return this; }),
    };
}

function snapshotRow(overrides = {}) {
    return {
        userId: '507f1f77bcf86cd799439011',
        fileKey: 'abcdefghijklmnop',
        nodeId: '1:2',
        fileName: 'Buildrs',
        nodeName: 'Hero',
        document: FRAME,
        designSpec: '- FRAME Hero 1440×800\n  - TEXT Headline "Ship faster"',
        updatedAt: new Date(),
        ...overrides,
    };
}

function mockSnapshot(row) {
    FigmaDesignSnapshot.findOne.mockReturnValue({
        lean: () => Promise.resolve(row),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    axios.mockReset();
    DesignToken.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
});

describe('sanitizeNodePayload', () => {
    test('keeps layout, text and paint fields and drops everything else', () => {
        const clean = sanitizeNodePayload(FRAME);

        expect(clean).toEqual(expect.objectContaining({
            id: '1:2',
            name: 'Hero',
            type: 'FRAME',
            layoutMode: 'VERTICAL',
            itemSpacing: 24,
        }));
        expect(clean.absoluteBoundingBox).toEqual({ x: 0, y: 0, width: 1440, height: 800 });
        expect(clean.children[0]).toEqual(expect.objectContaining({
            id: '1:3',
            characters: 'Ship faster',
            style: expect.objectContaining({ fontFamily: 'Inter', fontSize: 48 }),
        }));
        expect(clean.children[0].pluginData).toBeUndefined();
    });

    test('rejects nodes without an id or type', () => {
        expect(sanitizeNodePayload(null)).toBeNull();
        expect(sanitizeNodePayload({ name: 'no id' })).toBeNull();
        expect(sanitizeNodePayload({ id: '1:2' })).toBeNull();
    });

    test('drops prototype-polluting keys', () => {
        const clean = sanitizeNodePayload({
            id: '1:2',
            type: 'FRAME',
            name: 'Hero',
            fills: JSON.parse('{"__proto__": {"polluted": true}, "type": "SOLID"}'),
        });

        expect(clean.fills.polluted).toBeUndefined();
        expect({}.polluted).toBeUndefined();
    });
});

describe('saveDesignSnapshot', () => {
    test('stores the trimmed node with a rendered spec', async () => {
        FigmaDesignSnapshot.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
            ...update.$set,
            updatedAt: update.$set.updatedAt,
        }));

        const saved = await saveDesignSnapshot('507f1f77bcf86cd799439011', {
            fileKey: 'abcdefghijklmnop',
            nodeId: '1-2',
            node: FRAME,
            fileName: 'Buildrs',
        });

        expect(saved.nodeId).toBe('1:2');
        expect(saved.nodeName).toBe('Hero');
        expect(saved.designSpec).toMatch(/Hero/);
        const [, update] = FigmaDesignSnapshot.findOneAndUpdate.mock.calls[0];
        expect(update.$set.document.children[0].pluginData).toBeUndefined();
        expect(update.$set.document.children[0].characters).toBe('Ship faster');
    });

    test('rejects an invalid file key', async () => {
        await expect(saveDesignSnapshot('u', { fileKey: '../etc/passwd', nodeId: '1:2', node: FRAME }))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('POST /api/figma/snapshots', () => {
    test('accepts a frame from the helper', async () => {
        FigmaDesignSnapshot.findOneAndUpdate.mockResolvedValue({
            nodeId: '1:2',
            nodeName: 'Hero',
            document: FRAME,
            updatedAt: new Date(),
        });

        const response = await request(app)
            .post('/api/figma/snapshots')
            .send({ fileKey: 'abcdefghijklmnop', nodeId: '1-2', fileName: 'Buildrs', node: FRAME });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({ success: true, fileKey: 'abcdefghijklmnop', nodeId: '1:2' }));
    });

    test('rejects a bad file key', async () => {
        const response = await request(app)
            .post('/api/figma/snapshots')
            .send({ fileKey: 'not a key', nodeId: '1:2', node: FRAME });

        expect(response.status).toBe(400);
        expect(FigmaDesignSnapshot.findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('getDesignContext', () => {
    test('uses a fresh snapshot without touching Figma', async () => {
        mockSnapshot(snapshotRow());

        const context = await getDesignContext('507f1f77bcf86cd799439011', 'abcdefghijklmnop', '1-2');

        expect(axios).not.toHaveBeenCalled();
        expect(context.nodeId).toBe('1:2');
        expect(context.nodeName).toBe('Hero');
        expect(context.file.name).toBe('Buildrs');
        expect(context.designSpec).toContain('Hero');
        expect(context.components).toEqual([]);
    });

    test('falls back to an older snapshot when the live API fails', async () => {
        mockSnapshot(snapshotRow({ updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }));
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403, data: {} } }));

        const context = await getDesignContext('507f1f77bcf86cd799439011', 'abcdefghijklmnop', '1:2');

        expect(axios).toHaveBeenCalled();
        expect(context.nodeName).toBe('Hero');
        expect(context.designSpec).toContain('Headline');
    });

    test('throws the live error when there is no snapshot', async () => {
        mockSnapshot(null);
        Integration.findOne.mockResolvedValue(makeIntegration());
        axios.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403, data: {} } }));

        await expect(getDesignContext('507f1f77bcf86cd799439011', 'abcdefghijklmnop', '1:2'))
            .rejects.toThrow(/Forbidden/);
    });
});

describe('POST /api/design-code/generate', () => {
    test('generates code from a snapshot with no Figma access', async () => {
        mockSnapshot(snapshotRow());
        aiService.chat.mockResolvedValue({
            success: true,
            content: '### FILE: src/Hero.jsx\nexport default function Hero() { return null; }',
            codeBlocks: [{ file: 'src/Hero.jsx', lang: 'jsx', code: 'export default function Hero() { return null; }' }],
        });

        const response = await request(app)
            .post('/api/design-code/generate')
            .send({ fileKey: 'abcdefghijklmnop', nodeId: '1-2', target: 'react' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.files[0].path).toBe('src/Hero.jsx');
        expect(axios).not.toHaveBeenCalled();
        const prompt = aiService.chat.mock.calls[0][0][1].content;
        expect(prompt).toContain('Ship faster');
        expect(prompt).toContain('Hero');
    });
});
