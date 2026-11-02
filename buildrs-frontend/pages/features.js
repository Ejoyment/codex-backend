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
} from '../components/AnimationKit';

const LAYERS = [
  {
    num: '00',
    name: 'Spec-driven agents',
    status: 'partial',
    blurb: 'Our standout: agents that propose, you approve.',
    features: [
      ['Spec to branch', 'Each agent run works in its own isolated branch from your spec — never straight on main.', 'agent-v1 · git'],
      ['Proposed changes + approval gate', 'Agents stage changes as a changeset you review line-by-line before anything merges.', 'agentChangeSet · VFS'],
      ['Spec verification (AST)', 'Specs are checked against the code with AST-level verification, not a text match.', 'sdd · ast'],
      ['Checks & audit trail', 'Approvals, rejections, diffs and spec results are logged end-to-end for every run.', 'diff · logs'],
    ],
  },
  {
    num: '01',
    name: 'AI development',
    status: 'partial',
    blurb: 'An assistant with the context of a teammate.',
    features: [
      ['AI pair programmer', 'Refactors, explains, and writes tests against your real repository context.', 'Groq · Gemini'],
      ['Codebase memory', 'The assistant indexes your project and remembers it across sessions.', 'index · 1.2s'],
      ['Secure sandbox', 'Run and debug generated code with gated execution — never on your machine.', 'xterm.js'],
      ['Smart completions', 'Inline suggestions that learn from your code, not from the crowd.', 'LSP-aware'],
    ],
  },
  {
    num: '02',
    name: 'Real-time collaboration',
    status: 'live',
    blurb: 'Conflict-free, from the first commit.',
    features: [
      ['Multi-user co-editing', 'Cursors, selections, and edits stream in real time over Yjs CRDT.', 'CRDT · yjs'],
      ['Presence & avatars', 'See who is online, where they are working, and what they are reading.', 'presence'],
      ['Inline audio', 'Jump into voice while coding together, straight from the workspace.', 'rooms'],
      ['Live reviews', 'Review PRs line-by-line with the author present in the same file.', 'pairs'],
    ],
  },
  {
    num: '03',
    name: 'Communication',
    status: 'live',
    blurb: 'Async and live talk, anchored to the code.',
    features: [
      ['Threaded chat', 'Persistent threads that anchor to files and lines, indexed and searchable.', 'search'],
      ['Standups', 'Daily standups with structured updates, run inside the workspace.', 'meetings'],
      ['Meeting rooms', 'Video and screen share for deep-dive sessions without leaving the tab.', 'webrtc'],
      ['Support tickets', 'AI support agents triage tickets with full project context.', 'ai · human-in-loop'],
    ],
  },
  {
    num: '04',
    name: 'Team & projects',
    status: 'live',
    blurb: 'The planning surface next to the code.',
    features: [
      ['Projects & tasks', 'Kanban boards, assignments, and activity tracking beside your files.', 'roles'],
      ['Company profiles', 'One tenant per company with invites and user management.', 'rbac'],
      ['Role-based access', 'Granular permissions from solo freelancer to enterprise admin.', 'JWT · OAuth'],
      ['Code search', 'Full-text and semantic search over every file in the workspace.', 'meilisearch'],
    ],
  },
  {
    num: '05',
    name: 'Integrations',
    status: 'partial',
    blurb: 'Bring the stack you already run.',
    features: [
      ['GitHub', 'Full repository, pull request, and review access without leaving Buildrs.', 'repos · PRs'],
      ['Slack', 'Inline notifications and threaded communication.', 'notify · threads'],
      ['Discord', 'Community and team connectivity where your people already talk.', 'webhooks'],
      ['Figma', 'Design-to-code workflows and asset handoff in context.', 'design-tokens'],
      ['Notion', 'Documentation and knowledge-base sync.', 'sync'],
      ['MCP', 'Model Context Protocol servers wired into the workspace agent surface.', 'mcp'],
    ],
  },
  {
    num: '06',
    name: 'Security & billing',
    status: 'partial',
    blurb: 'Priced honestly, built to ship anywhere.',
    features: [
      ['Authentication', 'JWT sessions plus Google and GitHub OAuth.', 'JWT · OAuth'],
      ['Audit logs', 'Every impactful action recorded and reviewable.', 'compliance'],
      ['SSO', 'Single sign-on for the enterprise tier.', 'SOC 2-ready'],
      ['Global payments', 'Stripe, Paystack, and Flutterwave for teams everywhere — with verified webhooks.', '3 rails · webhook'],
    ],
  },
];

export default function Features() {
  return (
    <>
      <Head>
        <title>Features — BuildrsHQ</title>
        <meta
          name="description"
          content="Spec-driven agents with an approval gate, AI pair programming, real-time co-editing, terminal, git, meetings, billing and every integration — the complete BuildrsHQ feature catalog with honest maturity labels."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        <MouseGlow />
        <ParticleField count={15} />
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-6">
                <span className="dot">●</span> buildrs · features
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mkt-h1">
                Seven layers.
                <br />
                One <span className="accent">workspace</span>.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[560px]">
                From spec-driven agents with an approval gate to real-time collaboration, billing
                and integrations — everything your team needs to plan, build, review, and ship lives
                in one surface, so context survives the handoff and the tab-switching stops.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Layers */}
        <section className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <StaggerChildren className="space-y-px overflow-hidden rounded-xl border border-[#ffffff10]" stagger={0.08}>
            {LAYERS.map((layer) => (
              <StaggerItem key={layer.num}>
              <div className="border-b border-[#ffffff10] bg-[#0a0a0d] last:border-b-0">
                <div className="flex flex-col gap-4 p-7 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-9">
                  <div className="sm:w-[300px] sm:shrink-0">
                    <div className="flex items-center gap-3">
                      <p className="mkt-num text-sm text-[#59687a]">{layer.num}</p>
                      <h2 className="mkt-h3">{layer.name}</h2>
                      <span className={`mkt-pill ${layer.status}`}>{layer.status}</span>
                    </div>
                    <p className="mt-3 hidden max-w-[220px] text-[13px] leading-relaxed text-[#748194] sm:block">
                      {layer.blurb}
                    </p>
                  </div>
                  <div className="grid flex-1 gap-px overflow-hidden rounded-lg border border-[#ffffff10] sm:grid-cols-2">
                    {layer.features.map(([title, desc, tag]) => (
                      <div key={title} className="group bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
                        <h3 className="text-[14px] font-semibold tracking-tight text-white">{title}</h3>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#a9b7c4]">{desc}</p>
                        <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">{tag}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* ── Complete catalog ─────────────────────────── */}
        <section className="mx-auto max-w-[1200px] px-5 sm:px-8 pt-24">
          <ScrollReveal>
            <div className="mb-8">
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> complete catalog · from the codebase
              </p>
              <h2 className="mkt-h2">Every feature we ship — nothing hidden.</h2>
              <p className="mkt-sub mt-4 max-w-[620px]">
                Straight from the repository. <span className="mkt-pill partial">partial</span> means it
                exists and runs but is still being hardened; <span className="mkt-pill live">live</span>{' '}
                means it is ready for daily use today.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Spec-driven agents (proposed changes + approvals)</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">agent-v1 · agentSocket · agentChangeSet</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Branch-isolated execution (agent branches)</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">gitService · agentChangeSet</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">SDD/spec verification (AST)</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">sddVerificationService</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Specs CRUD</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">routes/specs.js</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">VFS + editor integration</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">CodeFile · editor routes</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Real-time co-editing (Yjs)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">yjs CRDT</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Terminal (node-pty)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">terminal routes · pty</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Git operations (branches/commits/diff)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">git routes · simple-git</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">LSP + smart completions</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">lspManager</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Debug adapter (DAP)</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">debugAdapter</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">IDE runner + sandbox execution</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">sandboxSecurity · docker</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Meetings / RTC (WebRTC)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">rtc routes · meetings</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">AI Pair (chat/session)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">ai-pair routes</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">AI providers (Groq/Gemini/etc)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">aiService</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Multi-rail billing (Stripe/Paystack/Flutterwave)</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">paymentRouter · billingCron</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Verified webhooks (3 rails, raw-body + timing-safe)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">webhookSecurity</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Entitlements & credit pool</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">subscription routes · creditPoolService</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Authentication (JWT/OAuth)</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">auth routes · middleware</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Projects / Tasks / Teams / Companies</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">projects · tasks · teams routes</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Notifications</p>
                <span className="mkt-pill live">Live</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">notificationService</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Deployments + VPS/SSH + Docker sandbox</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">deployments · vps routes</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Pipelines / CI</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">routes/pipelines.js</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">Support tickets + dashboard</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">support routes · dashboard</p>
            </div>
            <div className="group rounded-xl border border-[#ffffff10] bg-[#121821] p-5 transition-colors hover:bg-[#161d29]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-white">GitHub / Slack / Discord / Figma / Notion / MCP</p>
                <span className="mkt-pill partial">Partial</span>
              </div>
              <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#59687a]">integration routes</p>
            </div>
          </div>
        </section>

      <section className="mx-auto max-w-[1200px] px-5 sm:px-8 py-14">
        <p className="mkt-eyebrow mb-3"><span className="dot">●</span> comparison</p>
        <h2 className="mkt-h2 text-2xl sm:text-3xl md:text-4xl">vs Cursor · Continue · Aider · Cline</h2>
        <p className="mt-3 max-w-2xl text-[14px] sm:text-[15px] text-[#a9b7c4]">Fact-based comparison of key differentiators. Maturity reflects BuildrsHQ implementation.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-[13px]">
            <thead><tr className="border-b border-[#ffffff10] text-[#748194]"><th className="py-2">Capability</th><th className="py-2">BuildrsHQ</th><th className="py-2">Cursor</th><th className="py-2">Continue</th><th className="py-2">Aider</th><th className="py-2">Cline</th></tr></thead>
            <tbody>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">Spec-driven agents (isolated branch + approval gate)</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">Varies</td><td className="py-2 text-[#748194]">Varies</td><td className="py-2 text-[#748194]">CLI-focused</td><td className="py-2 text-[#748194]">Varies</td></tr>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">Proposed changes review before merge (VFS)</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">Inline edits</td><td className="py-2 text-[#748194]">Editor-based</td><td className="py-2 text-[#748194]">Diff-based</td><td className="py-2 text-[#748194]">Plan/act</td></tr>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">SDD/spec verification (AST)</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td></tr>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">All-in-one workspace (editor+terminal+meetings+git)</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">IDE-focused</td><td className="py-2 text-[#748194]">IDE extension</td><td className="py-2 text-[#748194]">CLI</td><td className="py-2 text-[#748194]">IDE extension</td></tr>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">Multi-rail billing for emerging markets</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">Stripe-centric</td><td className="py-2 text-[#748194]">Varies</td><td className="py-2 text-[#748194]">Self-host</td><td className="py-2 text-[#748194]">Varies</td></tr>
              <tr className="border-b border-[#ffffff10]"><td className="py-2 text-[#a9b7c4]">Verified webhooks + operator safety</td><td className="py-2 text-[#12dce5]">Partial</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td><td className="py-2 text-[#748194]">N/A</td></tr>
            </tbody>
          </table>
        </div>
      </section>

        {/* CTA */}
        <section className="relative overflow-hidden mt-24 border-t border-[#ffffff0f]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <ScrollReveal>
              <h2 className="mkt-h2 mx-auto max-w-[600px]">
                The features are the point. Free to try them all.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <p className="mkt-sub mx-auto mt-5 max-w-[440px]">
                No credit card, no sales call. Sign up and the whole workspace is live.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton strength={0.15}>
                  <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                    Start building <span className="mkt-arrow">→</span>
                  </Link>
                </MagneticButton>
                <Link href="/pricing" className="mkt-btn !px-7 !py-3 !text-[15px]">
                  See pricing
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

      </SiteShell>
    </>
  );
}
