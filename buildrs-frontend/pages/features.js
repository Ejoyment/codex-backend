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
    num: '01',
    name: 'AI development',
    status: 'live',
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
    status: 'beta',
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
    status: 'live',
    blurb: 'Bring the stack you already run.',
    features: [
      ['GitHub', 'Full repository, pull request, and review access without leaving Buildrs.', 'repos · PRs'],
      ['Slack', 'Inline notifications and threaded communication.', 'notify · threads'],
      ['Discord', 'Community and team connectivity where your people already talk.', 'webhooks'],
      ['Figma', 'Design-to-code workflows and asset handoff in context.', 'design-tokens'],
      ['Notion', 'Documentation and knowledge-base sync.', 'sync'],
    ],
  },
  {
    num: '06',
    name: 'Security & billing',
    status: 'beta',
    blurb: 'Priced honestly, built to ship anywhere.',
    features: [
      ['Authentication', 'JWT sessions plus Google and GitHub OAuth.', 'JWT · OAuth'],
      ['Audit logs', 'Every impactful action recorded and reviewable.', 'compliance'],
      ['SSO', 'Single sign-on for the enterprise tier.', 'SOC 2-ready'],
      ['Global payments', 'Stripe, Paystack, and Flutterwave for teams everywhere.', '3 rails'],
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
          content="AI pair programming, real-time co-editing, communication, project management, integrations, and enterprise-grade security in one workspace."
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
                Six layers.
                <br />
                One <span className="accent">workspace</span>.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[560px]">
                Everything your team needs to plan, build, review, and ship is engineered
                into one surface — so context survives the handoff, and the tab-switching stops.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Layers */}
        <section className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <StaggerChildren className="space-y-px overflow-hidden rounded-xl border border-[#ffffff12]" stagger={0.08}>
            {LAYERS.map((layer) => (
              <StaggerItem key={layer.num}>
              <div className="border-b border-[#ffffff12] bg-[#0a0a0d] last:border-b-0">
                <div className="flex flex-col gap-4 p-7 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-9">
                  <div className="sm:w-[300px] sm:shrink-0">
                    <div className="flex items-center gap-3">
                      <p className="mkt-num text-sm text-[#525764]">{layer.num}</p>
                      <h2 className="mkt-h3">{layer.name}</h2>
                      <span className={`mkt-pill ${layer.status}`}>{layer.status}</span>
                    </div>
                    <p className="mt-3 hidden max-w-[220px] text-[13px] leading-relaxed text-[#686e7c] sm:block">
                      {layer.blurb}
                    </p>
                  </div>
                  <div className="grid flex-1 gap-px overflow-hidden rounded-lg border border-[#ffffff10] sm:grid-cols-2">
                    {layer.features.map(([title, desc, tag]) => (
                      <div key={title} className="group bg-[#0d0d12] p-5 transition-colors hover:bg-[#121219]">
                        <h3 className="text-[14px] font-semibold tracking-tight text-white">{title}</h3>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#a8adba]">{desc}</p>
                        <p className="mkt-mono mt-3 text-[10.5px] uppercase tracking-widest text-[#525764]">{tag}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden mt-24 border-t border-[#ffffff0d]">
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