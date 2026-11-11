// Shared design standards for AI-generated user interfaces.
//
// Why this exists: the coding agents can produce working HTML/CSS/JSX that is
// structurally correct and visually unusable — default browser typography,
// random spacing, several accent colours, no hover/focus states, inline styles
// everywhere. The prompt already says *what* to build; nothing said how it
// should look.
//
// A checklist alone converges on the same generic "modern SaaS" template every
// model produces, so the full block also forces a deliberate design direction
// before any code is written, and names the clichés to avoid. Two lengths:
//   DESIGN_STANDARDS       full rules, for one-shot file generation
//   DESIGN_STANDARDS_BRIEF condensed rules, for per-iteration ReAct prompts
//                          where the block is re-sent on every step

const UI_SIGNAL = /\b(ui|ux|design|styled?|stylesheet|css|scss|sass|less|tailwind|layout|responsive|mockup|wireframe|landing page|website|web app|webapp|dashboard|frontend|front-end|html|jsx|tsx|vue|svelte|component|screen|page|theme|typography|palette|hero|navbar|sidebar|modal|form|button)\b/i;

// Concrete directions rather than "make it look good". The model must pick one
// that fits the brief — the failure mode is defaulting to the same centered
// hero / three cards / indigo accent for every product.
const DESIGN_DIRECTIONS = [
    'Editorial — publishing, portfolios, culture, brand sites: a display serif or high-contrast face, asymmetric grid, generous margins, hairline rules instead of cards.',
    'Swiss / technical — developer tools, infrastructure, B2B software: a neo-grotesk with a mono accent for data, strict grid, dense information with air around it, one signal colour.',
    'Warm minimal — lifestyle, wellness, finance, consumer apps: soft neutrals, one warm accent, rounded geometry, calm spacing, photography-forward.',
    'Luxury / fashion — premium products, hospitality, high-end services: high-contrast serif, black and ivory, very large type, few elements, deliberately slow spacing.',
    'Brutalist / expressive — studios, events, creative products: oversized type, hard edges, flat blocks of colour, visible structure, no soft shadows or gradients.',
    'Playful / consumer — marketplaces, social and consumer tools: bright but tightly limited palette, chunky radii, one signature illustration or shape, friendly microcopy.',
    'Corporate / institutional — finance, healthcare, enterprise: restrained palette, excellent tables and forms, serif or humanist headings, legibility over decoration.',
];

const DESIGN_STANDARDS = `DESIGN STANDARDS — every user-facing interface you generate must look deliberately designed, not templated. Work in this order:

1. CHOOSE A DIRECTION BEFORE CODE. Read the request and pick the direction below that genuinely fits the product. Do not default to "modern SaaS" out of habit. Record it in a short comment at the top of the stylesheet: direction, heading + body typefaces, colour roles, density.
${DESIGN_DIRECTIONS.map((d) => `   - ${d}`).join('\n')}

2. TYPOGRAPHY CARRIES THE DESIGN. Pair two faces on purpose (display serif + neutral sans, grotesk + mono for data, or one characterful face with a restrained partner) and give display text real size contrast against body copy (clamp() is fine). system-ui/Inter is a fallback, not a design choice — do not reach for it when the brief has a personality. Heading line-height ~1.1–1.2, body ~1.6, never below 12px, at most two families.

3. PALETTE WITH A POINT OF VIEW. One dominant surface colour, one accent used sparingly for primary actions and focus, plus a small neutral scale. Dark themes: near-black page, one-step-lighter surfaces, borders at 8–12% white, body text ~90% white, muted ~60–70%; light themes mirror that. Body text must meet WCAG AA (4.5:1). No five-colour pastel gradients, no default indigo/violet unless it is genuinely the brand.

4. LET CONTENT PICK THE LAYOUT. Start with a coherent page shell (max-width ~1120–1280px, consistent gutters, generous whitespace, clear hierarchy: one h1, short supporting copy, then sections). But vary the structure to suit the content: split or asymmetric headers, editorial two-column text, full-bleed moments, tables, timelines, a single strong statement. Not every page is centred-hero → three icon cards → footer. Sections should not all share the same width and rhythm.

5. SYSTEM AND STATE. Use one spacing scale (4/8/16/24/32/48/64) and one radius scale via CSS custom properties. Every interactive element needs default, hover, focus-visible, active and disabled states; one button height (36–44px), padding and weight. Inputs need labels and a visible focus ring. Prefer 1px borders and restrained shadows over heavy outlines.

6. RESPONSIVE AND ACCESSIBLE BY DEFAULT. Mobile-first, collapses to one column below ~720px, no horizontal overflow, touch targets at least 40px, text and images scale instead of clipping. Semantic landmarks, alt text, and keyboard order that matches the visual order.

7. WRITE REAL CONTENT. Specific, realistic copy for the actual product — real section headings, real feature names, real numbers. No "Lorem ipsum", "Feature 1/2/3", "Elevate your workflow", "Trusted by thousands", or emoji standing in for icons.

8. RESTRAINT. One memorable detail per page (an oversized section number, a serif pull quote, a distinctive rule or well-chosen image) is stronger than five effects. If in doubt, remove an element.

AVOID THESE CLICHÉS unless the brief explicitly asks for them: purple/blue gradient text, glowing blobs or mesh gradients, glassmorphism/frosted panels everywhere, an identical rounded card with icon + title + two lines for every feature, every section centred with the same padding, and emoji-as-icons.

STRUCTURE: put styles in real stylesheet files (styles.css, a CSS module, or the project's existing styling approach) and link/import them. Do not repeat long inline style attributes, and do not ship a page whose only styling is a browser default. If the project already has a design system, tokens or stylesheet, extend it instead of inventing a parallel one. Reference images/fonts with correct relative paths; never hotlink random external URLs.`;

const DESIGN_STANDARDS_BRIEF = `DESIGN STANDARDS (apply to any UI you touch): choose a deliberate direction that fits the product (editorial, Swiss/technical, warm minimal, luxury, brutalist, playful, corporate) instead of defaulting to generic SaaS; pair typefaces on purpose with real display/body contrast; one dominant surface + one sparing accent with WCAG-AA contrast; let content choose the layout rather than hero + three cards every time; one spacing/type/colour/radius system via tokens; hover/focus-visible/disabled states on every control; mobile-first layouts that collapse to one column under ~720px; real copy, no lorem ipsum, emoji icons, gradient text or glassmorphism; styles live in real stylesheet files and extend the project's existing design system if it has one.`;

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
    DESIGN_DIRECTIONS,
    DESIGN_STANDARDS,
    DESIGN_STANDARDS_BRIEF,
    isUiWork,
    designGuidanceFor,
};
