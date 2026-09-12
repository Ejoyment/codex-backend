import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';
import {
  ScrollReveal,
  StaggerChildren,
  StaggerItem,
  ParticleField,
  MouseGlow,
  MagneticButton,
  TiltCard,
} from '../components/AnimationKit';

const STACK = [
  {
    name: 'Workspace',
    status: 'live',
    badge: 'CRDT · yjs',
    desc: 'Co-edit files with live cursors and presence — conflict-free.',
  },
  {
    name: 'AI pair',
    status: 'live',
    badge: 'Groq · Gemini',
    desc: 'An assistant with real memory of your codebase, not a paste-in tab.',
  },
  {
    name: 'Terminal',
    status: 'live',
    badge: 'xterm · sandbox',
    desc: 'Run, debug, and test in a secure in-browser sandbox.',
  },
  {
    name: 'Tasks',
    status: 'live',
    badge: 'roles · kanban',
    desc: 'Plan, assign, and track work two tabs away from the code.',
  },
  {
    name: 'Meetings',
    status: 'beta',
    badge: 'standups · review',
    desc: 'Standups and live code review, inside the workspace.',
  },
  {
    name: 'Chat',
    status: 'live',
    badge: 'threads · search',
    desc: 'Async talk that lives beside the code it is about.',
  },
  {
    name: 'Integrations',
    status: 'live',
    badge: 'github · slack · figma',
    desc: 'Connect the stack you already run today.',
  },
  {
    name: 'Support agents',
    status: 'beta',
    badge: 'ai · tickets',
    desc: 'Tickets answered by AI with full project context.',
  },
];

const BUILD = [
  {
    icon: '⌥',
    title: 'Code editor',
    tag: 'LSP · multi-cursor',
    desc: 'An editor with language intelligence, inline AI completions, and a virtual file system.',
  },
  {
    icon: 'AI',
    title: 'AI pair programmer',
    tag: 'memory · refactor',
    desc: 'Explains code, writes tests, and refactors against your real repository context.',
  },
  {
    icon: '>_',
    title: 'Sandbox terminal',
    tag: 'xterm · gated exec',
    desc: 'Full shell in the browser with command gating — experiment without risk.',
  },
  {
    icon: '⌘',
    title: 'Source control',
    tag: 'PRs · diffs',
    desc: 'Pull requests, reviews, and diffs rendered inside the workspace, not a separate app.',
  },
];

const COLLAB = [
  {
    num: '01',
    title: 'Live co-editing',
    desc: 'Cursors, selections, and edits stream in real time over Yjs CRDT — no lock files, no merge pain.',
  },
  {
    num: '02',
    title: 'Presence & rooms',
    desc: 'See who is on, where they are working, and hop into a room or a standup without leaving the tab.',
  },
  {
    num: '03',
    title: 'Threads on code',
    desc: 'Chat and review threads anchor to files and lines, so decisions keep their context.',
  },
  {
    num: '04',
    title: 'Roles that scale',
    desc: 'Company profiles, role-based permissions, and audit logs from two-person teams to enterprise.',
  },
];

const RUN = [
  {
    tag: 'projects',
    title: 'Everything in scope',
    desc: 'Projects, tasks, activity, and deployments tracked in one surface you can route a whole sprint through.',
  },
  {
    tag: 'billing',
    title: 'Paid how you pay',
    desc: 'Stripe, Paystack, and Flutterwave — localized rails for teams in Africa, Asia, and everywhere.',
  },
  {
    tag: 'security',
    title: 'Enterprise-ready',
    desc: 'JWT + OAuth, audit logs, and SOC 2-ready infrastructure with SSO on the enterprise tier.',
  },
];

const WHY = [
  {
    num: '01',
    title: 'Kill the switch-tax',
    desc: 'Developers lose up to 40% of their week to context-switching across a scattered toolchain. Buildrs keeps code, chat, and AI in one place.',
  },
  {
    num: '02',
    title: 'AI with your context',
    desc: 'The pair programmer indexes your repo and your workflows — so a suggestion arrives already knowing the codebase.',
  },
  {
    num: '03',
    title: 'Real-time by design',
    desc: 'CRDT co-editing, presence, standups, and threads are the kernel of the product, not bolt-on plugins.',
  },
  {
    num: '04',
    title: 'Global and secure',
    desc: 'Stripe, Paystack, Flutterwave. SSO, audit logs, SOC 2-ready. Priced honestly, built to ship anywhere.',
  },
];

// Row = array of [text, tokenClass]. `ghost` rows render the inline-AI shimmer.
const CODE_ROWS = [
  [{ text: '// dashboard — live co-editing with presence', cls: 'tok-cm' }],
  [
    { text: 'import', cls: 'tok-kw' },
    { text: ' { PresenceCursors } ', cls: 'tok-tp' },
    { text: 'from', cls: 'tok-kw' },
    { text: " '@/lib/yjs'", cls: 'tok-str' },
  ],
  [
    { text: 'import', cls: 'tok-kw' },
    { text: ' { useTasks } ', cls: 'tok-tp' },
    { text: 'from', cls: 'tok-kw' },
    { text: " '@/lib/tasks'", cls: 'tok-str' },
  ],
  [],
  [
    { text: 'export ', cls: 'tok-kw' },
    { text: 'function ', cls: 'tok-kw' },
    { text: 'Dashboard', cls: 'tok-fn' },
    { text: '() {', cls: 'tok-tp' },
  ],
  [
    { text: '  const ', cls: 'tok-kw' },
    { text: '{ peers, online } ', cls: 'tok-tp' },
    { text: '=', cls: 'tok-kw' },
    { text: ' ', cls: 'tok-tp' },
    { text: 'usePresence', cls: 'tok-fn' },
    { text: "('acme/core')", cls: 'tok-str' },
  ],
  [
    { text: '  const ', cls: 'tok-kw' },
    { text: '{ tasks, sync } ', cls: 'tok-tp' },
    { text: '=', cls: 'tok-kw' },
    { text: ' ', cls: 'tok-tp' },
    { text: 'useTasks', cls: 'tok-fn' },
    { text: '()', cls: 'tok-str' },
  ],
  [],
  [
    { text: '  return', cls: 'tok-kw' },
    { text: ' (', cls: 'tok-tp' },
  ],
  [
    { text: '    <section ', cls: 'tok-tp' },
    { text: 'className', cls: 'tok-fn' },
    { text: '="stack">', cls: 'tok-kw' },
  ],
  [
    { text: '      <Editor ', cls: 'tok-tp' },
    { text: 'peers', cls: 'tok-fn' },
    { text: '={', cls: 'tok-kw' },
    { text: 'peers', cls: 'tok-tp' },
    { text: '} />', cls: 'tok-tp' },
  ],
  [
    { text: '      <TaskRail ', cls: 'tok-tp' },
    { text: 'tasks', cls: 'tok-fn' },
    { text: '={', cls: 'tok-kw' },
    { text: 'tasks', cls: 'tok-tp' },
    { text: '} />', cls: 'tok-tp' },
  ],
  [{ text: '      <AiGhost text="git commit -m \'joined live session\'" />', cls: 'tok-ghost', ghost: true }],
  [{ text: '    </section>', cls: 'tok-tp' }],
  [
    { text: '  )', cls: 'tok-tp' },
  ],
  [{ text: '}', cls: 'tok-tp' }],
  [{ text: '// ada, rowan, kai are editing right now — 3 cursors live', cls: 'tok-cm' }],
];

const TREE_ROWS = [
  { indent: 0, text: '⌄ acme-core', cls: 't-dir' },
  { indent: 1, text: '⌄ src', cls: 't-dir' },
  { indent: 2, text: '⌄ components', cls: 't-dir' },
  { indent: 3, text: '◉ dashboard.tsx', cls: 't-file on' },
  { indent: 3, text: '○ cards.tsx', cls: 't-file' },
  { indent: 2, text: '⌄ api', cls: 't-dir' },
  { indent: 3, text: '○ auth.ts', cls: 't-file' },
  { indent: 2, text: '⌄ lib', cls: 't-dir' },
  { indent: 3, text: '○ yjs.ts', cls: 't-file' },
  { indent: 1, text: '○ README.md', cls: 't-file' },
];

const MINIMAP = [0, 1, 0, 1, 0, 3, 2, 1, 0, 1, 4, 1, 2, 0, 1, 1, 3];

export default function Index() {
  return (
    <>
      <Head>
        <title>BuildrsHQ — The Unified Development Command Center</title>
        <meta
          name="description"
          content="AI pair programming, live co-editing, tasks, and meetings — your entire dev stack in one workspace. Free to start, no credit card."
        />
        <link rel="icon" href="/buildrs.png" />
        <meta name="google-site-verification" content="NInX_C65m0qT6XHwkGnzhfNT-uR1ZbkUdm6BhFJNTVc" />
      </Head>

      <SiteShell>
        <MouseGlow />
        <ParticleField count={20} />
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
          <div className="mkt-hero-bg" />
          <div className="mkt-dots" />
          <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8">
            <div className="mx-auto max-w-[680px] text-center">
              <ScrollReveal>
                <p className="mkt-eyebrow mb-7">
                  <span className="dot">●</span> buildrs · unified dev command center
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
                <h1 className="mkt-h1">
                  Your whole dev stack.
                  <br />
                  One <span className="accent">command center</span>.
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={0.2}>
                <p className="mkt-sub mt-7 max-w-[520px] mx-auto">
                  Buildrs collapses the eleven-tool ritual — GitHub, Slack, ChatGPT, Figma,
                  Notion — into a single workspace. AI pair programming, live co-editing, tasks,
                  and standups, side by side with your code.
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.3}>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                  <MagneticButton strength={0.15}>
                    <Link href="/signup" className="mkt-btn mkt-btn-primary !px-6 !py-3 !text-[15px]">
                      Start building <span className="mkt-arrow">→</span>
                    </Link>
                  </MagneticButton>
                  <Link href="/demo" className="mkt-btn !px-6 !py-3 !text-[15px]">
                    Explore the platform <span className="mkt-arrow">↗</span>
                  </Link>
                </div>
                <p className="mkt-mono mt-8 text-xs text-[#525764]">
                  free plan · no credit card · ready in under a minute
                </p>
              </ScrollReveal>
            </div>

            {/* Editor mock */}
            <div className="mx-auto mt-16 max-w-[1240px]">
              <TiltCard>
              <div className="mkt-term relative overflow-hidden">
              <div className="mkt-term-bar">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <span className="title mkt-mono">acme/core — src/components/dashboard.tsx</span>
                <div className="mkt-live ml-auto">
                  <span className="dot" />
                  <span className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                    yjs · 3 online
                  </span>
                </div>
              </div>

              {/* open tabs */}
              <div className="mkt-ed-tabs mkt-mono">
                <span className="mkt-ed-tab active">dashboard.tsx</span>
                <span className="mkt-ed-tab">cards.tsx</span>
                <span className="mkt-ed-tab">auth.ts</span>
                <span className="mkt-ed-tab">›_ terminal</span>
              </div>

              <div className="mkt-ed-body">
                {/* file explorer */}
                <div className="mkt-ed-tree">
                  {TREE_ROWS.map((r, i) => (
                    <div key={i} className={r.cls} style={{ paddingLeft: r.indent * 12 }}>
                      {r.text}
                    </div>
                  ))}
                </div>

                {/* code */}
                <div className="mkt-ed-code mkt-mono">
                  {CODE_ROWS.map((row, i) => (
                    <div key={i} className={`mkt-ed-row${row.length ? '' : ' active'}`}>
                      <span className="mkt-ed-ln">{i + 1}</span>
                      <span className="whitespace-pre-wrap">
                        {row.map((t, j) =>
                          t.ghost ? (
                            <span key={j} className="tok-ghost">
                              ✦ {t.text}
                            </span>
                          ) : (
                            <span key={j} className={t.cls}>
                              {t.text}
                            </span>
                          )
                        )}
                      </span>
                      {i === 5 && (
                        <span className="mkt-presence">
                          <span className="bar" style={{ background: '#e5b84a' }} />
                          <span className="tag">ada</span>
                        </span>
                      )}
                      {i === 11 && (
                        <span className="mkt-presence">
                          <span className="bar" style={{ background: '#2fd6e6' }} />
                          <span className="tag">rowan</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* minimap */}
                <div className="mkt-ed-minimap" aria-hidden>
                  {MINIMAP.map((m, i) => (
                    <i key={i} className={m === 4 ? 'cursor' : m === 0 ? '' : 'hl'} style={{ flex: m ? 1 : 0.6 }} />
                  ))}
                </div>
              </div>

              {/* status bar */}
              <div className="mkt-ed-status mkt-mono">
                <span className="ok">● main</span>
                <span>TSX</span>
                <span>
                  Ln {CODE_ROWS.length}, Col 8
                </span>
                <span className="mkt-ed-hide-sm">Spaces: 2</span>
                <span className="mkt-ed-hide-sm">UTF-8</span>
                <span className="mkt-ed-hide-sm">⌘S saved</span>
                <span className="mkt-live ml-auto">
                  <span className="dot" />
                  3 cursors · AI groq
                </span>
              </div>
              </div>
              </TiltCard>
            </div>
          </div>
        </section>

        {/* ── Live strip ───────────────────────────────────── */}
        <section className="border-y border-[#ffffff0d]">
          <StaggerChildren className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px px-5 py-0 sm:px-8 lg:grid-cols-4" stagger={0.08}>
            {[
              { k: '10+', v: 'tools replaced by one workspace', note: 'github · slack · figma · notion' },
              { k: '3', v: 'payment rails · Stripe · Paystack · Flutterwave', note: 'priced in USD, paid locally' },
              { k: '0', v: 'merge conflicts on live co-edits', note: 'yjs CRDT conflict resolution' },
              { k: '24/7', v: 'AI pair programmer, always on', note: 'groq + google generative ai' },
            ].map((s) => (
              <StaggerItem key={s.k}>
              <div className="px-2 py-8 sm:px-4">
                <p className="mkt-num text-3xl text-white sm:text-4xl">{s.k}</p>
                <p className="mt-3 text-[13px] leading-snug text-[#a8adba]">{s.v}</p>
                <p className="mkt-mono mt-2 text-[10.5px] text-[#525764]">{s.note}</p>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* ── The stack ────────────────────────────────────── */}
        <section className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8">
          <ScrollReveal>
            <div className="mb-10 flex items-end justify-between gap-6">
              <div>
                <p className="mkt-eyebrow mb-4">
                  <span className="dot">●</span> buildrs · the stack
                </p>
                <h2 className="mkt-h2">One workspace, every layer.</h2>
              </div>
              <p className="mkt-mono hidden text-[11px] uppercase tracking-widest text-[#525764] lg:block">
                click a layer
              </p>
            </div>
          </ScrollReveal>

          <StaggerChildren className="mkt-grid grid-cols-1 md:grid-cols-2" stagger={0.06}>
            {STACK.map((s) => (
              <StaggerItem key={s.name}>
              <Link href="/features" className="mkt-cell group block h-full">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="mkt-h3 flex items-center gap-3">
                    <span className="mkt-mono text-sm text-[#525764]">▸</span>
                    {s.name}
                  </h3>
                  <span className={`mkt-pill ${s.status}`}>{s.status}</span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">
                  <span className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#686e7c]">it can: </span>
                  {s.desc}
                </p>
                <p className="mkt-mono mt-4 text-[10.5px] uppercase tracking-widest text-[#525764]">
                  {s.badge}
                </p>
              </Link>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* ── Build ────────────────────────────────────────── */}
        <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
          <ScrollReveal>
            <div className="mb-10">
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> build
              </p>
              <h2 className="mkt-h2 max-w-[640px]">
                Every surface you need to write and ship code.
              </h2>
            </div>
          </ScrollReveal>
          <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] sm:grid-cols-2" stagger={0.08}>
            {BUILD.map((b) => (
              <StaggerItem key={b.title}>
              <div className="group h-full bg-[#0d0d12] p-7 transition-colors hover:bg-[#121219]">
                <div className="mkt-mono mb-5 flex h-9 w-9 items-center justify-center rounded-md border border-[#ffffff14] text-[13px] text-[#2fd6e6]">
                  {b.icon}
                </div>
                <h3 className="mkt-h3">{b.title}</h3>
                <p className="mkt-mono mt-1 text-[10.5px] uppercase tracking-widest text-[#525764]">{b.tag}</p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{b.desc}</p>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* ── Collaborate ──────────────────────────────────── */}
        <section className="border-y border-[#ffffff0d] bg-[#0a0a0d]">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <ScrollReveal>
                  <p className="mkt-eyebrow mb-4">
                    <span className="dot">●</span> collaborate
                  </p>
                </ScrollReveal>
                <ScrollReveal delay={0.1}>
                  <h2 className="mkt-h2">Built live, from the first commit.</h2>
                </ScrollReveal>
                <ScrollReveal delay={0.2}>
                  <p className="mkt-sub mt-5 max-w-[420px]">
                    The workspace is real-time at its core — because shipping is a team sport,
                    not a relay of file drops.
                  </p>
                </ScrollReveal>
                <div className="mt-8 rounded-lg border border-[#ffffff12] bg-[#0d0d12] p-5">
                  <div className="mkt-live mb-3">
                    <span className="dot" />
                    <span className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                      4 teammates online in acme/core
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      ['ada', 'src/components/dashboard.tsx', '#2fd6e6'],
                      ['rowan', 'reviewing PR #128', '#e5b84a'],
                      ['kai', 'room: standup in 12m', '#686e7c'],
                      ['you', 'editing cards.tsx', '#2fd6e6'],
                    ].map(([name, act, color]) => (
                      <div key={name} className="flex items-center gap-3 text-[13px]">
                        <span
                          className="mkt-mono flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-[#04181b]"
                          style={{ background: color }}
                        >
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="mkt-mono text-[#a8adba]">{name}</span>
                        <span className="mkt-mono text-[#525764]">{act}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] sm:grid-cols-2" stagger={0.08}>
                {COLLAB.map((c) => (
                  <StaggerItem key={c.num}>
                  <div className="bg-[#0d0d12] p-7 h-full transition-colors hover:bg-[#121219]">
                    <p className="mkt-num text-sm text-[#2fd6e6]">{c.num}</p>
                    <h3 className="mkt-h3 mt-4">{c.title}</h3>
                    <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{c.desc}</p>
                  </div>
                  </StaggerItem>
                ))}
              </StaggerChildren>
            </div>
          </div>
        </section>

        {/* ── Run / production ─────────────────────────────── */}
        <section className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8">
          <ScrollReveal>
            <div className="mb-10">
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> run
              </p>
              <h2 className="mkt-h2 max-w-[680px]">The platform your org actually operates on.</h2>
              <p className="mkt-sub mt-5 max-w-[560px]">
                Projects, billing, and security that hold up under real load — never a bolt-on afterthought.
              </p>
            </div>
          </ScrollReveal>
          <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] md:grid-cols-3" stagger={0.08}>
            {RUN.map((r) => (
              <StaggerItem key={r.title}>
              <div className="bg-[#0d0d12] p-7 h-full transition-colors hover:bg-[#121219]">
                <p className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#686e7c]">{r.tag}</p>
                <h3 className="mkt-h3 mt-4">{r.title}</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{r.desc}</p>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>

          <div className="mkt-term mt-8">
            <div className="mkt-term-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="title mkt-mono">buildrs — live status</span>
              <span className="mkt-live ml-auto">
                <span className="dot" />
                <span className="text-[11px] capitalize text-[#2fd6e6]">live</span>
              </span>
            </div>
            <div className="mkt-term-body grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <div><span className="d">next.js</span> · edge rendering</div>
              <div><span className="d">yjs</span> · conflict-free editing</div>
              <div><span className="d">xterm.js</span> · sandboxed shell</div>
              <div><span className="d">paystack</span> · <span className="d">flutterwave</span> · <span className="d">stripe</span></div>
              <div><span className="d">mongo</span> · audit-logged</div>
              <div><span className="ok">● buildrshq.dev — stable</span></div>
            </div>
          </div>
        </section>

        {/* ── Why ──────────────────────────────────────────── */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8">
            <ScrollReveal>
              <div className="mb-12">
                <p className="mkt-eyebrow mb-4">
                  <span className="dot">●</span> why buildrs
                </p>
                <h2 className="mkt-h2">Designed for teams that ship.</h2>
              </div>
            </ScrollReveal>
            <StaggerChildren className="grid gap-x-16 gap-y-12 md:grid-cols-2" stagger={0.08}>
              {WHY.map((w) => (
                <StaggerItem key={w.num}>
                <div className="flex gap-6 border-t border-[#ffffff12] pt-6">
                  <p className="mkt-num text-sm text-[#525764]">{w.num}</p>
                  <div>
                    <h3 className="mkt-h3">{w.title}</h3>
                    <p className="mt-2.5 text-[14px] leading-relaxed text-[#a8adba]">{w.desc}</p>
                  </div>
                </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* ── Community ────────────────────────────────────── */}
        <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
          <ScrollReveal>
            <div className="mb-10">
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> community
              </p>
              <h2 className="mkt-h2">Built in the open. Join in.</h2>
            </div>
          </ScrollReveal>
          <StaggerChildren className="mkt-grid grid-cols-1 md:grid-cols-3" stagger={0.08}>
            {[
              { name: 'X', handle: '@buildrshq', desc: 'Ship logs, launches, and build-in-public threads.' },
              { name: 'GitHub', handle: 'github.com/codex-inc', desc: 'The pieces that are open, licensed to stay that way.' },
              { name: 'Discord', handle: 'buildrshq community', desc: 'Talk to the builders — dev, feedback, and showcase.' },
            ].map((c) => (
              <StaggerItem key={c.name}>
              <div className="mkt-cell h-full">
                <div className="flex items-center justify-between">
                  <h3 className="mkt-h3">{c.name}</h3>
                  <span className="mkt-link-arrow">↗</span>
                </div>
                <p className="mkt-mono mt-1.5 text-xs text-[#686e7c]">{c.handle}</p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{c.desc}</p>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-28 text-center sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-6">
                <span className="dot">●</span> get started
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h2 className="mkt-h2 mx-auto max-w-[640px]">Pick a layer. Start there.</h2>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mx-auto mt-5 max-w-[440px]">
                One workspace, no credit card, no migration project. Your first build is minutes away.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.3}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton strength={0.15}>
                  <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                    Start building <span className="mkt-arrow">→</span>
                  </Link>
                </MagneticButton>
                <Link href="/features" className="mkt-btn !px-7 !py-3 !text-[15px]">
                  See the features
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </SiteShell>
    </>
  );
}