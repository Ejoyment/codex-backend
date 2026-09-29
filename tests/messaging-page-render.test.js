/**
 * Render-time smoke test for the messaging page.
 *
 * `next build` and the API tests both passed while this page threw
 * "Cannot access 'ee' before initialization" in the browser: the production
 * bundle never evaluates the component body, so nothing else caught a
 * temporal-dead-zone violation between a `useState` declaration and the
 * dependency array of an effect declared above it.
 *
 * This executes the component's render-time prefix (state declarations and
 * effect registrations, up to the JSX return) against stubbed hooks, which is
 * exactly where that class of bug lives.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'buildrs-frontend', 'pages', 'messaging.js');

const STUBS = `
const state = [];
let hookIndex = 0;
function useState(init) {
  const i = hookIndex++;
  if (!(i in state)) state[i] = typeof init === 'function' ? init() : init;
  return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v; }];
}
const effects = [];
function useEffect(fn, deps) { effects.push({ fn, deps }); }
function useRef(v) { return { current: v }; }
const useAuthStore = (sel) => sel({ user: { _id: 'u1' }, subscription: { tier: 'pro', status: 'active' } });
const useRouter = () => ({ push() {} });
const useCurrentCompany = () => ({ hasCompany: true, loading: false, companies: [] });
const getTierLimits = () => ({ features: { teamChat: true } });
const normalizeTier = (t) => t;
const getAvatarUrl = () => '';
const apiFetch = async () => ({ companies: [] });
const Sidebar = null, AuthGuard = null;
const MessageSquare = null, Plus = null, Send = null, Hash = null;
const X = null, Building2 = null, Loader2 = null, ArrowUpRight = null;
`;

/** The component source from its signature up to the JSX return. */
function renderTimePrefix() {
    const source = fs.readFileSync(PAGE, 'utf8');
    const start = source.indexOf('export default function Messaging()');
    if (start === -1) throw new Error('could not locate the Messaging component');
    const body = source.slice(start);
    const jsxReturn = body.indexOf('\n  return (');
    if (jsxReturn === -1) throw new Error('could not locate the JSX return');

    let prefix = body.slice(0, jsxReturn).replace('export default function Messaging()', 'function Messaging()', 1);

    // Balance whatever braces the cut left open (the component function itself).
    let balance = 0;
    let quote = null;
    let prev = '';
    for (const ch of prefix) {
        if (quote) {
            if (ch === quote && prev !== '\\') quote = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
        } else if (ch === '{') balance++;
        else if (ch === '}') balance--;
        prev = ch;
    }
    return prefix + '}'.repeat(balance);
}

function render() {
    const sandbox = {};
    vm.createContext(sandbox);
    // Top-level const/let bindings are not exposed as sandbox properties, so
    // return the effect list as the script's completion value.
    return vm.runInContext(
        `${STUBS}\n${renderTimePrefix()}\nMessaging();\neffects;`,
        sandbox,
        { filename: 'messaging-render.js' }
    );
}

describe('messaging page renders without a temporal dead zone error', () => {
    test('component body evaluates and registers its effects', () => {
        const effects = render();
        expect(Array.isArray(effects)).toBe(true);
        expect(effects.length).toBeGreaterThan(0);
    });

    test('every effect dependency is initialized before it is read', () => {
        // The bug: useEffect(..., [companyId]) above `const [companyId] = useState()`.
        // Evaluating the deps array during render is what throws.
        const effects = render();
        for (const { deps } of effects) {
            if (!Array.isArray(deps)) continue;
            for (const dep of deps) {
                expect(dep).not.toBeUndefined();
            }
        }
    });

    test('the companyId effect starts from the declared initial value, not a stale closure', () => {
        const effects = render();
        const companyEffect = effects.find(e => Array.isArray(e.deps) && e.deps.length === 2 && e.deps[1] === false);
        expect(companyEffect).toBeDefined();
        expect(companyEffect.deps[0]).toBe('');
    });
});
