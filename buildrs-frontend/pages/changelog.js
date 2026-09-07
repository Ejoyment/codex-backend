import Head from 'next/head';
import Link from 'next/link';
import SiteShell from '../components/SiteShell';

const VERSIONS = [
  {
    version: '2.5.0',
    latest: true,
    date: '2026-02-08',
    changes: [
      ['feature', 'AI pair programming — an assistant with codebase memory'],
      ['perf', 'Code completion speed improved ~40%'],
      ['fix', 'Terminal rendering on Windows'],
      ['feature', 'Syntax highlighting for 15+ languages'],
    ],
  },
  {
    version: '2.4.0',
    date: '2026-01-25',
    changes: [
      ['feature', 'Collaborative editing with live presence'],
      ['feature', 'Git integration: diffs and PR views in the workspace'],
      ['fix', 'Memory leak in large projects'],
      ['docs', 'Documentation overhaul for onboarding'],
    ],
  },
  {
    version: '2.3.0',
    date: '2026-01-10',
    changes: [
      ['feature', 'Additional workspace themes'],
      ['perf', 'Editor indexing performance'],
      ['fix', 'Stability and crash fixes throughout'],
    ],
  },
  {
    version: '2.2.0',
    date: '2025-12-19',
    changes: [
      ['feature', 'Paystack and Flutterwave billing rails'],
      ['feature', 'Sandbox terminal gating controls'],
      ['perf', 'First-load bundle reduced'],
    ],
  },
];

const KIND_COLOR = {
  feature: 'text-[#2fd6e6]',
  perf: 'text-[#e5b84a]',
  fix: 'text-[#a8adba]',
  docs: 'text-[#686e7c]',
};

export default function Changelog() {
  return (
    <>
      <Head>
        <title>Changelog — BuildrsHQ</title>
        <meta
          name="description"
          content="See what shipped in Buildrs — features, fixes, and performance notes, release by release."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · changelog
            </p>
            <h1 className="mkt-h1">
              What <span className="accent">shipped</span> lately.
            </h1>
            <p className="mkt-sub mt-6 max-w-[480px]">
              Every release, logged in the open. Latest: v2.5.0 — AI pair programming.
            </p>
          </div>
        </section>

        {/* Versions */}
        <section className="mx-auto max-w-[820px] px-5 sm:px-8">
          <div className="divide-y divide-[#ffffff0d] overflow-hidden rounded-xl border border-[#ffffff12] bg-[#0d0d12]">
            {VERSIONS.map((v) => (
              <div key={v.version} className="flex flex-col gap-6 p-7 sm:flex-row sm:gap-10 sm:p-8">
                <div className="sm:w-[150px] sm:shrink-0">
                  <div className="flex items-center gap-2.5">
                    <p className="mkt-num text-lg text-white">v{v.version}</p>
                    {v.latest && <span className="mkt-pill live">latest</span>}
                  </div>
                  <p className="mkt-mono mt-2 text-[11px] uppercase tracking-widest text-[#525764]">{v.date}</p>
                </div>
                <ul className="flex-1 space-y-3">
                  {v.changes.map(([kind, text]) => (
                    <li key={text} className="flex items-start gap-3 text-[13.5px]">
                      <span className={`mkt-mono mt-0.5 text-[12px] ${KIND_COLOR[kind]}`}>+</span>
                      <span className="leading-relaxed text-[#a8adba]">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mkt-mono mt-6 text-center text-[11px] text-[#525764]">
            earlier releases · chronicled in the docs →{' '}
            <Link href="/docs" className="text-[#2fd6e6]">docs/buildrs/changelog</Link>
          </p>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden mt-20 border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <h2 className="mkt-h2 mx-auto max-w-[560px]">New this week is shipping fast.</h2>
            <p className="mkt-sub mx-auto mt-5 max-w-[400px]">
              The fastest way to test a release is to open the workspace.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                Try the latest <span className="mkt-arrow">→</span>
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}