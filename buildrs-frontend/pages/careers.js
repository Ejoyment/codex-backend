import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';

const JOBS = [
  {
    title: 'Senior Full-Stack Engineer',
    dept: 'engineering',
    location: 'remote · worldwide',
    type: 'full-time',
    desc: 'Build the core of the workspace — React, Node.js, and the AI pair surfaces.',
  },
  {
    title: 'AI/ML Research Engineer',
    dept: 'ai research',
    location: 'remote · worldwide',
    type: 'full-time',
    desc: 'Push AI-assisted coding: novel approaches to code generation and codebase memory.',
  },
  {
    title: 'Product Designer',
    dept: 'design',
    location: 'remote · worldwide',
    type: 'full-time',
    desc: 'Design dense, calm interfaces for developers — where power comes from restraint.',
  },
  {
    title: 'Developer Advocate',
    dept: 'devrel',
    location: 'remote · worldwide',
    type: 'part-time',
    desc: 'Be the voice of the community — write, speak, and help developers get the most out of the workspace.',
  },
];

const PERKS = [
  ['01', 'Remote-first', 'Work from anywhere with async hours that respect real life.'],
  ['02', 'Ship culture', 'Small loops, real releases, and a bias toward doing.'],
  ['03', 'Equity', 'Everyone early shares in the upside of CODEX INC.'],
  ['04', 'The right tools', 'A full Buildrs workspace — dogfood the product you build.'],
];

export default function Careers() {
  return (
    <>
      <Head>
        <title>Careers — BuildrsHQ</title>
        <meta
          name="description"
          content="Join the CODEX INC team building Buildrs — the unified development command center. Remote-first, worldwide."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · careers
            </p>
            <h1 className="mkt-h1">
              Work where building
              <br />
              is the <span className="accent">point</span>.
            </h1>
            <p className="mkt-sub mt-6 max-w-[520px]">
              Remote-first, async, and worldwide. We are a small team doing a lot of
              shipp—and we want people who are excited by that.
            </p>
          </div>
        </section>

        {/* Perks */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto grid max-w-[1200px] gap-px px-5 py-4 sm:px-8 lg:grid-cols-4">
            {PERKS.map(([num, title, desc]) => (
              <div key={num} className="border-b border-[#ffffff0d] py-8 lg:border-b-0 lg:py-4">
                <p className="mkt-num text-sm text-[#2fd6e6]">{num}</p>
                <h3 className="mkt-h3 mt-3">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#a8adba]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Open roles */}
        <section className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> open roles
              </p>
              <h2 className="mkt-h2">We are hiring.</h2>
            </div>
            <p className="mkt-mono hidden text-[11px] uppercase tracking-widest text-[#525764] lg:block">
              {JOBS.length} positions · remote
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12]">
            {JOBS.map((job) => (
              <div key={job.title} className="group flex flex-col gap-5 bg-[#0d0d12] p-7 transition-colors hover:bg-[#121219] md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mkt-h3">{job.title}</h3>
                    <span className="mkt-pill">{job.dept}</span>
                  </div>
                  <p className="mkt-mono mt-2 text-[11px] uppercase tracking-widest text-[#525764]">
                    {job.location} · {job.type}
                  </p>
                  <p className="mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-[#a8adba]">{job.desc}</p>
                </div>
                <Link href="/contact" className="mkt-btn flex-shrink-0">
                  Apply <span className="mkt-arrow">→</span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <h2 className="mkt-h2 mx-auto max-w-[560px]">Don’t see your role?</h2>
            <p className="mkt-sub mx-auto mt-5 max-w-[400px]">
              If you build the thing the role describes, tell us anyway. We are always listening.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/contact" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                Get in touch <span className="mkt-arrow">→</span>
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}