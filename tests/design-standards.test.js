/**
 * The shared design baseline is injected only where it applies, in the right
 * size: full standards for one-shot file generation, a brief block for the
 * per-iteration ReAct loop.
 */
jest.mock('../utils/aiRouterService', () => ({ routeChat: jest.fn() }));

const {
    DESIGN_STANDARDS,
    DESIGN_STANDARDS_BRIEF,
    isUiWork,
    designGuidanceFor,
} = require('../utils/designStandards');
const agentRunner = require('../utils/agentRunner');

describe('isUiWork', () => {
    test('detects user-facing UI work', () => {
        expect(isUiWork('Build a landing page for the product')).toBe(true);
        expect(isUiWork('Fix the dashboard layout on mobile')).toBe(true);
        expect(isUiWork(['Update src/App.tsx'], 'restyle the navbar')).toBe(true);
        expect(isUiWork('Create styles.css and link it')).toBe(true);
        expect(isUiWork('Add a settings modal component')).toBe(true);
    });

    test('does not fire for backend-only work', () => {
        expect(isUiWork('Add a webhook retry queue to the Stripe handler')).toBe(false);
        expect(isUiWork('Fix the Mongo connection pool leak')).toBe(false);
        expect(isUiWork('Write unit tests for the payments service')).toBe(false);
        expect(isUiWork('')).toBe(false);
        expect(isUiWork(null, undefined, 42)).toBe(false);
    });
});

describe('designGuidanceFor', () => {
    test('returns the full block for UI work', () => {
        expect(designGuidanceFor('build a website')).toBe(DESIGN_STANDARDS);
    });

    test('returns the brief block when brief is requested', () => {
        expect(designGuidanceFor('build a website', { brief: true })).toBe(DESIGN_STANDARDS_BRIEF);
    });

    test('returns nothing for non-UI work', () => {
        expect(designGuidanceFor('fix the redis reconnect logic')).toBe('');
        expect(designGuidanceFor(['migrate the database'], { brief: true })).toBe('');
    });

    test('always forces the block on regardless of the text', () => {
        expect(designGuidanceFor('fix the redis reconnect logic', { always: true })).toBe(DESIGN_STANDARDS);
        expect(designGuidanceFor('', { always: true, brief: true })).toBe(DESIGN_STANDARDS_BRIEF);
    });

    test('the blocks mention the rules that keep output from looking unfinished', () => {
        for (const block of [DESIGN_STANDARDS, DESIGN_STANDARDS_BRIEF]) {
            expect(block).toMatch(/spacing/i);
            expect(block).toMatch(/typography|type scale|spacing\/type/i);
            expect(block).toMatch(/focus/i);
            expect(block).toMatch(/stylesheet/i);
            expect(block).toMatch(/colou?r/i);
        }
    });
});

describe('agentRunner.buildAgentContext design injection', () => {
    const codeFiles = [
        { path: '/src', name: 'App.tsx', language: 'javascript', content: 'export default function App() { return null; }' },
    ];

    test('includes the standards for a UI task', () => {
        const { messages } = agentRunner.buildAgentContext({
            task: { title: 'Restyle the pricing page', description: 'Give the pricing page a proper layout and stylesheet' },
            project: { name: 'Acme', technologies: ['React'] },
            codeFiles,
        });

        expect(messages[0].content).toContain(DESIGN_STANDARDS);
    });

    test('omits the standards for backend-only work', () => {
        const { messages } = agentRunner.buildAgentContext({
            task: { title: 'Add idempotency keys', description: 'Deduplicate webhook retries in the payments worker' },
            project: { name: 'Acme', technologies: ['Node.js'] },
            codeFiles,
        });

        expect(messages[0].content).not.toContain(DESIGN_STANDARDS);
    });

    test('defers to a linked Figma design instead of the generic baseline', () => {
        const { messages } = agentRunner.buildAgentContext({
            task: { title: 'Build the settings page', description: 'Match the Figma' },
            codeFiles,
            figmaSummary: 'Design tokens: acrylic surface, 12px radius',
        });

        expect(messages[0].content).not.toContain(DESIGN_STANDARDS);
        expect(messages.map((m) => m.content).join('\n')).toContain('acrylic surface');
    });
});
