/**
 * Exact Figma design spec for AI coding (utils/figmaDesignSpec) and the
 * prompt block agents receive (utils/figmaContextService.toFigmaPromptBlock).
 */
const {
    normalizeNodeId,
    parseFigmaUrl,
    renderDesignSpec,
    listPagesAndFrames,
} = require('../utils/figmaDesignSpec');
const { toFigmaPromptBlock } = require('../utils/figmaContextService');
const { buildAgentContext } = require('../utils/agentRunner');

describe('normalizeNodeId', () => {
    test.each([
        ['1-2', '1:2'],
        ['1%3A2', '1:2'],
        ['12:34', '12:34'],
        ['I1:2;3:4', 'I1:2;3:4'],
    ])('%s → %s', (input, expected) => {
        expect(normalizeNodeId(input)).toBe(expected);
    });

    test.each(['', null, 'abc', '1:2:3', 'javascript:alert(1)'])('rejects %p', (input) => {
        expect(normalizeNodeId(input)).toBeNull();
    });
});

describe('parseFigmaUrl', () => {
    test('extracts file key and node id from a frame link', () => {
        expect(parseFigmaUrl('https://www.figma.com/design/abcdefghijklmnopqrstuv/App?node-id=12-34&t=x'))
            .toEqual({ fileKey: 'abcdefghijklmnopqrstuv', nodeId: '12:34' });
    });

    test('accepts a raw key and rejects non-file links', () => {
        expect(parseFigmaUrl('abcdefghijklmnopqrstuv')).toEqual({ fileKey: 'abcdefghijklmnopqrstuv', nodeId: null });
        expect(parseFigmaUrl('https://www.figma.com/files/team/123')).toBeNull();
        expect(parseFigmaUrl('hello')).toBeNull();
    });
});

const frame = {
    id: '1:2',
    type: 'FRAME',
    name: 'Card',
    absoluteBoundingBox: { x: 100, y: 200, width: 320, height: 180 },
    layoutMode: 'VERTICAL',
    itemSpacing: 12,
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    strokes: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
    strokeWeight: 1,
    cornerRadius: 16,
    effects: [{ type: 'DROP_SHADOW', visible: true, offset: { x: 0, y: 4 }, radius: 12, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.1 } }],
    children: [
        {
            id: '1:3',
            type: 'TEXT',
            name: 'Title',
            absoluteBoundingBox: { x: 124, y: 224, width: 272, height: 28 },
            characters: 'Upgrade to Pro',
            style: { fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeightPx: 28, textAlignHorizontal: 'LEFT' },
            fills: [{ type: 'SOLID', color: { r: 0.067, g: 0.094, b: 0.153, a: 1 } }],
        },
        { id: '1:4', type: 'RECTANGLE', name: 'Hidden', visible: false },
    ],
};

describe('renderDesignSpec', () => {
    test('keeps the values needed to reproduce the frame', () => {
        const spec = renderDesignSpec(frame);
        const [root, title] = spec.split('\n');

        expect(root).toContain('FRAME "Card"');
        expect(root).toContain('id=1:2');
        expect(root).toContain('320x180 @0,0');
        expect(root).toContain('layout(column, gap 12, padding 24 24 24 24)');
        expect(root).toContain('fill #ffffff');
        expect(root).toContain('stroke 1px #e6e6e6');
        expect(root).toContain('radius 16');
        expect(root).toContain('shadow(0px 4px 12px 0px #000000 @0.1)');

        expect(title.startsWith('  - TEXT "Title"')).toBe(true);
        expect(title).toContain('272x28 @24,24');
        expect(title).toContain('font Inter 600 20px lh 28px align left');
        expect(title).toContain('text "Upgrade to Pro"');
        expect(title).toContain('fill #111827');

        expect(spec).not.toContain('Hidden');
    });

    test('truncates instead of exceeding the size limit', () => {
        const wide = { ...frame, children: Array.from({ length: 200 }, (_, i) => ({ id: `2:${i}`, type: 'RECTANGLE', name: `Box ${i}` })) };
        const spec = renderDesignSpec(wide, { maxChars: 800, maxChildren: 500 });

        expect(spec.length).toBeLessThan(1000);
        expect(spec).toContain('design spec truncated');
    });
});

describe('listPagesAndFrames', () => {
    test('returns pages with their top-level frames only', () => {
        const pages = listPagesAndFrames({
            children: [
                { id: '0:1', type: 'CANVAS', name: 'Screens', children: [frame, { id: '9:9', type: 'TEXT', name: 'Note' }] },
            ],
        });

        expect(pages).toEqual([
            { id: '0:1', name: 'Screens', frames: [{ id: '1:2', name: 'Card', type: 'FRAME', width: 320, height: 180 }] },
        ]);
    });
});

describe('agent prompt', () => {
    const figmaContext = {
        fileKey: 'abcdefghijklmnopqrstuv',
        fileName: 'App',
        nodeId: '1:2',
        nodeName: 'Card',
        imageUrl: 'https://cdn/card.png',
        designSpec: renderDesignSpec(frame),
        designSystem: { colors: [{ name: 'primary', value: '#111827' }] },
    };

    test('toFigmaPromptBlock includes the frame, rules, tokens and spec', () => {
        const block = toFigmaPromptBlock(figmaContext);

        expect(block).toContain('FIGMA DESIGN');
        expect(block).toContain('Frame: Card (node 1:2)');
        expect(block).toContain('https://cdn/card.png');
        expect(block).toContain('primary: #111827');
        expect(block).toContain('text "Upgrade to Pro"');
    });

    test('buildAgentContext passes the Figma design to the model', () => {
        const { messages } = buildAgentContext({
            task: { title: 'Build pricing card' },
            figmaSummary: toFigmaPromptBlock(figmaContext),
        });
        const all = messages.map((message) => message.content).join('\n');

        expect(all).toContain('FIGMA DESIGN');
        expect(all).toContain('must match the linked Figma frame exactly');
    });

    test('buildAgentContext without a design has no Figma block', () => {
        const { messages } = buildAgentContext({ task: { title: 'Fix bug' } });

        expect(messages.map((message) => message.content).join('\n')).not.toContain('FIGMA DESIGN');
    });
});

describe('task Figma fields', () => {
    const { resolveTaskFigmaFields } = require('../routes/projects');

    test('a pasted frame link fills the file key and node id', () => {
        expect(resolveTaskFigmaFields({ figmaNodeId: 'https://www.figma.com/design/abcdefghijklmnopqrstuv/App?node-id=5-6' }))
            .toEqual({ figmaFileKey: 'abcdefghijklmnopqrstuv', figmaNodeId: '5:6' });
    });

    test('explicit picker values are normalized', () => {
        expect(resolveTaskFigmaFields({
            figmaFileKey: 'abcdefghijklmnopqrstuv',
            figmaFileName: 'App',
            figmaNodeId: '5-6',
            figmaNodeName: 'Checkout',
        })).toEqual({ figmaFileKey: 'abcdefghijklmnopqrstuv', figmaFileName: 'App', figmaNodeId: '5:6', figmaNodeName: 'Checkout' });
    });

    test('partial updates only touch the fields sent', () => {
        expect(resolveTaskFigmaFields({ title: 'x' })).toEqual({});
        expect(resolveTaskFigmaFields({ figmaNodeId: null })).toEqual({ figmaNodeId: null, figmaNodeName: null });
    });

    test('an invalid file key is dropped', () => {
        expect(resolveTaskFigmaFields({ figmaFileKey: 'https://evil.example/x' })).toEqual({ figmaFileKey: null });
    });
});
