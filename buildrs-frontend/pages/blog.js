import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import SiteShell from '../components/SiteShell';
import {
  ScrollReveal,
  StaggerChildren,
  StaggerItem,
  ParticleField,
  MouseGlow,
} from '../components/AnimationKit';

const POSTS = [
  {
    date: '2026-02-08',
    tag: 'feature',
    title: 'Introducing AI pair programming',
    desc: 'An assistant that has read your repo — refactors, explains, and writes tests against real project context, not a paste-in tab.',
  },
  {
    date: '2026-02-05',
    tag: 'practice',
    title: '10 tips for better code reviews',
    desc: 'Practical reviewing habits for teams that ship on a cadence — and why live review beats async-at-a-distance.',
  },
  {
    date: '2026-02-01',
    tag: 'architecture',
    title: 'Building with microservices, sanely',
    desc: 'A field guide to designing and deploying microservices without trading your team’s sanity for scale.',
  },
  {
    date: '2026-01-24',
    tag: 'product',
    title: 'Why we chose Yjs CRDT over OT',
    desc: 'The conflict-free editing decisions behind live co-editing, and what it means when your team is in the same file.',
  },
  {
    date: '2026-01-18',
    tag: 'ops',
    title: 'The sandbox terminal, explained',
    desc: 'How gated in-browser execution keeps experiments safe without sending your team off-platform.',
  },
  {
    date: '2026-01-09',
    tag: 'company',
    title: 'Shipping to 54 countries from day one',
    desc: 'Stripe, Paystack, and Flutterwave — how localized payment rails shaped how Buildrs bills.',
  },
];

export default function Blog() {
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState('');

  const subscribe = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
  };

  const [featured, ...rest] = POSTS;

  return (
    <>
      <Head>
        <title>Blog — BuildrsHQ</title>
        <meta
          name="description"
          content="Build-in-public notes, engineering deep dives, and product updates from the Buildrs team."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        <MouseGlow />
        <ParticleField count={15} />
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-6">
                <span className="dot">●</span> buildrs · journal
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mkt-h1">
                Written while
                <br />
                <span className="accent">building</span>.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[520px]">
                Build logs, engineering notes, and updates from the team shipping Buildrs.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Featured */}
        <section className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <ScrollReveal>
          <Link href="#" className="mkt-card group block">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8 sm:p-10">
                <div className="flex items-center gap-3">
                  <span className="mkt-pill live">featured</span>
                  <span className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                    {featured.date}
                  </span>
                </div>
                <h2 className="mkt-h2 mt-6 group-hover:text-white">{featured.title}</h2>
                <p className="mkt-sub mt-4 max-w-[560px]">{featured.desc}</p>
                <span className="mkt-btn mt-8 inline-flex !text-[14px]">
                  Read the post <span className="mkt-arrow">→</span>
                </span>
              </div>
              <div className="mkt-term m-0 rounded-none border-0 border-l border-[#ffffff12]">
                <div className="mkt-term-body">
                  <div><span className="d">$</span> <span className="d">buildrs ai pair --explain</span></div>
                  <div className="mt-1.5"><span className="p">▸</span> indexing codebase · 1,284 files</div>
                  <div><span className="p">▸</span> reading src/components/dashboard.tsx</div>
                  <div className="mt-1.5"><span className="ok">✓</span> refactor applied — 42 lines removed</div>
                  <div className="mt-4 text-[#525764]">— from <span className="ok">ai pair, v2.5</span></div>
                </div>
              </div>
            </div>
          </Link>
          </ScrollReveal>
        </section>

        {/* Grid */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
          <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] md:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
            {rest.map((post) => (
              <StaggerItem key={post.title}>
              <Link href="#" className="group block h-full bg-[#0d0d12] p-7 transition-colors hover:bg-[#121219]">
                <div className="flex items-center gap-3">
                  <span className="mkt-pill">{post.tag}</span>
                  <span className="mkt-mono text-[10.5px] uppercase tracking-widest text-[#525764]">
                    {post.date}
                  </span>
                </div>
                <h3 className="mkt-h3 mt-5 leading-snug group-hover:text-white">{post.title}</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{post.desc}</p>
                <span className="mkt-link-arrow mt-5 inline-block text-[13px]">read →</span>
              </Link>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* Newsletter */}
        <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
          <ScrollReveal>
          <div className="mkt-card flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 className="mkt-h3">Shipping notes, monthly.</h2>
              <p className="mt-2 text-[13.5px] text-[#a8adba]">
                One email a month: what shipped, what broke, what is next. No noise.
              </p>
            </div>
            {subscribed ? (
              <p className="mkt-mono text-[13px] text-[#2fd6e6]">✓ subscribed — see you next month</p>
            ) : (
              <form onSubmit={subscribe} className="flex w-full max-w-[400px] gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mkt-input flex-1"
                  placeholder="you@company.com"
                  aria-label="email"
                />
                <button type="submit" className="mkt-btn mkt-btn-primary flex-shrink-0">
                  Subscribe
                </button>
              </form>
            )}
          </div>
          </ScrollReveal>
        </section>
      </SiteShell>
    </>
  );
}