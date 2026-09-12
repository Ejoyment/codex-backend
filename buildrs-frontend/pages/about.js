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

const VALUES = [
  {
    num: '01',
    title: 'Your code stays yours',
    desc: 'We never train AI on your source. Tenant-owned memory and encrypted project context, full stop.',
  },
  {
    num: '02',
    title: 'Craft over volume',
    desc: 'One workspace that is genuinely good at the whole pipeline beats ten tools that are each fine at a slice.',
  },
  {
    num: '03',
    title: 'Speed is a feature',
    desc: 'Context-switching is the tax we are built to refund. Every screen is an attempt to remove a tab.',
  },
  {
    num: '04',
    title: 'Global by default',
    desc: 'Local payment rails, async culture, and a remote-first team built for teams everywhere.',
  },
];

const TIMELINE = [
  ['the problem', 'Devs lose ~40% of the week to context-switching between 10+ disconnected tools.'],
  ['the insight', 'AI siloed in a chat tab has no context. Collaboration bolted on after the fact has no teeth.'],
  ['the bet', 'Put code, AI with real codebase memory, and real-time teamwork in one surface.'],
  ['today', 'Buildrs runs in the browser with CRDT co-editing, sandboxed terminals, and pay-as-you-go billing worldwide.'],
];

export default function About() {
  return (
    <>
      <Head>
        <title>About — BuildrsHQ</title>
        <meta
          name="description"
          content="Buildrs by CODEX INC — the unified development command center. Built to collapse the fragmented dev toolchain into one workspace."
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
                <span className="dot">●</span> buildrs · about
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mkt-h1">
                Built for teams
                <br />
                that <span className="accent">ship</span>.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[560px]">
                Buildrs is a product of CODEX INC ENTERPRISE. We took the eleven-tool ritual
                of modern development and rebuilt it as one command center.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Story / timeline */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <ScrollReveal>
                <p className="mkt-eyebrow mb-4">
                  <span className="dot">●</span> why we built this
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
                <h2 className="mkt-h2">From tab chaos to one workspace.</h2>
              </ScrollReveal>
              <ScrollReveal delay={0.2}>
                <p className="mkt-sub mt-5">
                  Every developer knows the feeling: GitHub open, Slack pinging, ChatGPT on the
                  side, a terminal buried somewhere. Feedback loops break, context evaporates,
                  and the actual building gets the leftovers.
                </p>
                <p className="mt-4 text-[14px] leading-relaxed text-[#a8adba]">
                  Buildrs was built so the loop never breaks — an AI pair programmer that has
                  read your repo, co-editing that cannot conflict, and standups that live where
                  the code is.
                </p>
              </ScrollReveal>
            </div>

            <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12]" stagger={0.08}>
              {TIMELINE.map(([tag, text], i) => (
                <StaggerItem key={tag}>
                <div className="flex gap-5 bg-[#0d0d12] p-6">
                  <p className="mkt-num text-sm text-[#525764]">{`0${i + 1}`}</p>
                  <div>
                    <p className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#2fd6e6]">{tag}</p>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-[#a8adba]">{text}</p>
                  </div>
                </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* Values */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> values
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h2 className="mkt-h2 mb-12">What we optimize for.</h2>
            </ScrollReveal>
            <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] sm:grid-cols-2" stagger={0.08}>
              {VALUES.map((v) => (
                <StaggerItem key={v.num}>
                <div className="bg-[#0d0d12] p-7 h-full">
                  <p className="mkt-num text-sm text-[#2fd6e6]">{v.num}</p>
                  <h3 className="mkt-h3 mt-4">{v.title}</h3>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{v.desc}</p>
                </div>
                </StaggerItem>
              ))}
            </StaggerChildren>

            {/* Team */}
            <div className="mt-16 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <ScrollReveal>
                <p className="mkt-eyebrow">
                  <span className="dot">●</span> the builder
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
              <div className="mkt-card max-w-[520px] p-7">
                <div className="flex items-center gap-5">
                  <div
                    className="mkt-mono flex h-14 w-14 items-center justify-center rounded-full text-[16px] font-semibold text-[#04181b]"
                    style={{ background: '#2fd6e6' }}
                  >
                    ED
                  </div>
                  <div>
                    <h3 className="mkt-h3">Ejoymene David</h3>
                    <p className="mkt-mono mt-1 text-[11px] uppercase tracking-widest text-[#686e7c]">
                      CEO & founder · codex inc
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-[13.5px] leading-relaxed text-[#a8adba]">
                  Oracle AI-certified professional with a security background. Built Buildrs to
                  give every team — from Lagos to San Francisco — the same ability to ship that
                  big platforms have.
                </p>
              </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <ScrollReveal>
              <h2 className="mkt-h2 mx-auto max-w-[560px]">Come see it working.</h2>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <p className="mkt-sub mx-auto mt-5 max-w-[420px]">
                No sales deck required — the workspace is live and free to try.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton strength={0.15}>
                  <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                    Start building <span className="mkt-arrow">→</span>
                  </Link>
                </MagneticButton>
                <Link href="/careers" className="mkt-btn !px-7 !py-3 !text-[15px]">
                  Work with us
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </SiteShell>
    </>
  );
}