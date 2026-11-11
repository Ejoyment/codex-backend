// Shared design standards for AI-generated user interfaces.
//
// Why this exists: the coding agents can produce working HTML/CSS/JSX that is
// structurally correct and visually unusable — default browser typography,
// random spacing, several accent colours, no hover/focus states, inline styles
// everywhere. The prompt already says *what* to build; nothing said how it
// should look. These blocks are injected wherever a model is about to write
// user-facing code, so every generation path starts from the same baseline.
//
// Two lengths:
//   DESIGN_STANDARDS       full rules, for one-shot file generation
//   DESIGN_STANDARDS_BRIEF condensed rules, for per-iteration ReAct prompts
//                          where the block is re-sent on every step

const UI_SIGNAL = /\b(ui|ux|design|styled?|stylesheet|css|scss|sass|less|tailwind|layout|responsive|mockup|wireframe|landing page|website|web app|webapp|dashboard|frontend|front-end|html|jsx|tsx|vue|svelte|component|screen|page|theme|typography|palette|hero|navbar|sidebar|modal|form|button)\b/i;

const DESIGN_STANDARDS = `DESIGN STANDARDS — every user-facing interface you generate must follow these. Aim for something a designer would ship, not a proof of concept:
- Start from a system, not ad-hoc values: one 8px spacing scale (4/8/16/24/32/48/64), one type scale (e.g. 12/14/16/20/28/40), one 5–6 colour palette (background, surface, border, text, muted text, one accent) and one radius scale (e.g. 8/12/16/full). Define them once (CSS custom properties / theme tokens) and reuse them everywhere.
- Layout: a real page shell — max-width container (~1120–1280px) centred with consistent gutters, generous whitespace, left-aligned content, and obvious hierarchy: one h1, short supporting copy, then sections with clear headings.
- Typography: a real font stack (system-ui, Inter, or one web font), heading line-height ~1.15 and body ~1.6, never below 12px, at most two font families, no all-caps body text.
- Colour: dark themes use a near-black page background, one-step-lighter surfaces, borders around 8–12% white, body text ~90% white and muted text ~60–70%; light themes mirror that. One accent colour, used for primary actions and focus — not as decoration. Body text must meet WCAG AA contrast (4.5:1).
- Components: every interactive element needs default, hover, focus-visible, active and disabled states. Buttons share one height (36–44px), padding, radius and font weight; cards use subtle 1px borders and soft shadows, not heavy outlines. Inputs need labels, consistent height and a visible focus ring.
- Responsive: mobile-first, content in a grid/flex layout that collapses to one column below ~720px, no horizontal overflow, touch targets at least 40px, images and text that scale instead of clipping.
- Content: write specific, realistic copy for the product being built. No "Lorem ipsum", no "Feature 1 / Feature 2 / Feature 3", no emoji standing in for icons — use an icon set (Lucide/Feather/Heroicons) or none.
- Structure: put styles in real stylesheet files (styles.css, a CSS module, or the project's existing styling approach) and link/import them. Do not repeat long inline style attributes, and do not ship a page whose only styling is a browser default. If the project already has a design system, tokens or stylesheet, extend it instead of inventing a parallel one.
- Assets: reference images/fonts with correct relative paths; never hotlink random external URLs.`;

const DESIGN_STANDARDS_BRIEF = `DESIGN STANDARDS (apply to any UI you touch): reuse one spacing/type/colour/radius system via tokens; max-width page shell with generous whitespace and clear hierarchy; one accent colour and WCAG-AA contrast; hover/focus-visible/disabled states on every control; mobile-first layouts that collapse to one column under ~720px; real copy, no lorem ipsum or emoji icons; styles live in real stylesheet files rather than repeated inline styles, and extend the project's existing design system if it has one.`;

/**
 * True when any of the supplied strings looks like user-facing UI work.
 * Used to decide whether a design block is worth its tokens.
 */
function isUiWork(...texts) {
    const haystack = texts
        .flat()
        .filter((t) => typeof t === 'string' && t)
        .join('\n')
        .slice(0, 20000);
    return UI_SIGNAL.test(haystack);
}

/**
 * The design block for a given task, or '' when the work is not UI-related.
 * `brief` keeps per-iteration prompts small.
 */
function designGuidanceFor(texts, { brief = false, always = false } = {}) {
    const relevant = always || isUiWork(texts);
    if (!relevant) return '';
    return brief ? DESIGN_STANDARDS_BRIEF : DESIGN_STANDARDS;
}

module.exports = {
    DESIGN_STANDARDS,
    DESIGN_STANDARDS_BRIEF,
    isUiWork,
    designGuidanceFor,
};
