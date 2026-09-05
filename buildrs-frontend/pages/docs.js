import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';

const DOCS = [
  {
    path: 'docs/quickstart',
    title: 'Getting started',
    desc: 'Create your account, connect a repo, and make your first commit before the coffee cools.',
  },
  {
    path: 'docs/api',
    title: 'API reference',
    desc: 'Every endpoint, example, and error code — for building on top of Buildrs.',
  },
  {
    path: 'docs/tutorials',
    title: 'Tutorials',
    desc: 'Step-by-step walks through the workflows teams actually run: co-editing, standups, reviews.',
  },
  {
    path: 'docs/integrations',
    title: 'Integrations',
    desc: 'Wire up GitHub, Slack, Discord, Notion, and Figma in a couple of clicks.',
  },
  {
    path: 'docs/ai-pair',
    title: 'AI pair',
    desc: 'How codebase memory works, what it can do, and how to keep it sharp.',
  },
  {
    path: 'docs/billing',
    title: 'Billing & plans',
    desc: 'Plans, payment rails, and how upgrades and downgrades behave.',
  },
];

export default function Docs() {
  return (
    <>
      <Head>
        <title>Documentation — BuildrsHQ</title>
        <meta
          name="description"
          content="Documentation for Buildrs — getting started, API reference, tutorials, and integrations."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · docs
            </p>
            <h1 className="mkt-h1">
              Docs for the
              <br />
              whole <span className="accent">stack</span>.
            </h1>
            <p className="mkt-sub mt-6 max-w-[520px]">
              From your first commit to building on the API. Pick a section or jump straight in.
            </p>

            <form className="mt-9 max-w-[520px]">
              <div className="mkt-term">
                <div className="mkt-term-body flex items-center gap-3">
                  <span className="d">$</span>
                  <input
                    className="mkt-term-input flex-1"
                    placeholder="search docs — e.g. “sandbox terminal”"
                    aria-label="search docs"
                  />
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* Sections */}
        <section className="mx-auto max-w-[1200px] px-5 pb-20 sm:px-8">
          <div className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] md:grid-cols-2 lg:grid-cols-3">
            {DOCS.map((doc) => (
              <Link key={doc.path} href="#" className="group bg-[#0d0d12] p-7 transition-colors hover:bg-[#121219]">
                <p className="mkt-mono text-[11px] uppercase tracking-widest text-[#525764]">{doc.path}</p>
                <h3 className="mkt-h3 mt-3 group-hover:text-white">{doc.title}</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#a8adba]">{doc.desc}</p>
                <span className="mkt-link-arrow mt-5 inline-block text-[13px]">open →</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Need help */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto grid max-w-[1200px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
            <div>
              <p className="mkt-eyebrow mb-4">
                <span className="dot">●</span> need help?
              </p>
              <h2 className="mkt-h2">Stuck? Talk to something that has read your workspace.</h2>
              <p className="mkt-sub mt-5 max-w-[440px]">
                The support center routes tickets to an AI agent with project context, and a human
                is always on the loop.
              </p>
            </div>
            <div className="flex flex-col items-start justify-center gap-4">
              <Link href="/support" className="mkt-btn mkt-btn-primary !px-7 !py-3">
                Open support center <span className="mkt-arrow">→</span>
              </Link>
              <Link href="/contact" className="mkt-btn !px-7 !py-3">
                Email a human
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}