import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import SiteShell from '../components/SiteShell';

const PLANS = [
  {
    name: 'Starter',
    price: 0,
    monthlyNote: '–',
    yearly: '–',
    blurb: 'A real workspace for solo builds.',
    cta: 'Start for free',
    href: '/signup',
    features: [
      ['1 workspace', true],
      ['10 projects', true],
      ['Basic AI assistance', true],
      ['Sandbox terminal', true],
      ['Community support', false],
      ['Real-time co-editing', false],
      ['Advanced AI memory', false],
      ['SSO & audit logs', false],
    ],
  },
  {
    name: 'Professional',
    price: 29,
    monthlyNote: '/mo',
    yearly: 290,
    featured: true,
    blurb: 'For teams that ship on a cadence.',
    cta: 'Get started',
    href: '/signup',
    features: [
      ['Everything in Starter', true],
      ['Unlimited projects', true],
      ['Advanced AI pair · codebase memory', true],
      ['Real-time co-editing · presence', true],
      ['Tasks · standups · meetings', true],
      ['GitHub · Slack · Figma integrations', true],
      ['Priority support', true],
      ['SSO & audit logs', false],
    ],
  },
  {
    name: 'Enterprise',
    price: 999,
    monthlyNote: '/mo',
    yearly: 9990,
    blurb: 'For orgs with compliance to meet.',
    cta: 'Contact sales',
    href: '/contact',
    features: [
      ['Everything in Professional', true],
      ['SSO authentication', true],
      ['Audit logs', true],
      ['Dedicated account manager', true],
      ['1-hour support SLA', true],
      ['Custom contracts', true],
      ['SOC 2-ready infrastructure', true],
    ],
  },
];

const COMPARE = [
  ['Workspaces', '1', 'Unlimited', 'Unlimited'],
  ['Projects', '10', 'Unlimited', 'Unlimited'],
  ['AI pair programmer', 'Basic', 'Advanced · memory', 'Advanced · memory'],
  ['Real-time co-editing', '–', '✓', '✓'],
  ['Tasks & standups', '–', '✓', '✓'],
  ['Integrations', '–', 'GitHub · Slack · Figma', '+ custom'],
  ['Support response', 'Community', '24h', '1h SLA'],
  ['SSO', '–', '–', '✓'],
  ['Audit logs', '–', '–', '✓'],
];

const FAQ = [
  ['Do I need a credit card to start?', 'No. The Starter workspace is free forever, with no card on file. You only add one when you upgrade.'],
  ['What does “real-time co-editing” actually mean?', 'Multiple developers edit the same file simultaneously with live cursors, powered by Yjs CRDT. No locks, no merge conflicts for concurrent edits.'],
  ['Which payment methods work?', 'Buildrs bills through Stripe, Paystack, and Flutterwave, so teams in Africa, Asia, and beyond pay in a local way.'],
  ['How is my workspace migrated?', 'Repository connection is one click from GitHub, and a built-in importer moves projects and docs over. Most teams are set up in under an hour.'],
  ['Can I downgrade or cancel anytime?', 'Yes, from Billing in your settings. Paid plans auto-downgrade to Starter at the end of the current period.'],
];

export default function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <>
      <Head>
        <title>Pricing — BuildrsHQ</title>
        <meta
          name="description"
          content="Free Starter workspace. Professional for shipping teams. Enterprise with SSO, audit logs, and SOC 2-ready infrastructure. Paid the way your team pays."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-14 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · pricing
            </p>
            <h1 className="mkt-h1">
              Priced so teams
              <br />
              just <span className="accent">start</span>.
            </h1>
            <p className="mkt-sub mt-6 max-w-[520px]">
              A free workspace that is actually free, a professional tier that scales with your
              team, and an enterprise tier for the orgs that need it.
            </p>

            <div className="mt-9 inline-flex items-center gap-1 rounded-lg border border-[#ffffff12] bg-[#0d0d12] p-1">
              <button
                type="button"
                onClick={() => setYearly(false)}
                className={`mkt-mono rounded-md px-4 py-2 text-xs tracking-wide transition ${
                  !yearly ? 'bg-[#1b1b22] text-white' : 'text-[#686e7c] hover:text-white'
                }`}
              >
                monthly
              </button>
              <button
                type="button"
                onClick={() => setYearly(true)}
                className={`mkt-mono flex items-center gap-2 rounded-md px-4 py-2 text-xs tracking-wide transition ${
                  yearly ? 'bg-[#1b1b22] text-white' : 'text-[#686e7c] hover:text-white'
                }`}
              >
                yearly <span className="text-[#2fd6e6]">save ~17%</span>
              </button>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="mx-auto max-w-[1200px] px-5 pb-20 sm:px-8">
          <div className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-[#0d0d12] p-8 ${plan.featured ? 'lg:-my-4 lg:rounded-lg lg:border lg:border-[#2fd6e680] lg:bg-[#0f0f15]' : ''} ${
                  plan.featured ? 'shadow-[0_0_60px_-20px_rgba(47,214,230,0.35)]' : ''
                }`}
              >
                {plan.featured && (
                  <span className="mkt-pill live absolute right-6 top-6">popular</span>
                )}
                <p className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                  {plan.name}
                </p>
                <p className="mt-2.5 text-[13.5px] text-[#a8adba]">{plan.blurb}</p>

                <div className="mt-7 flex items-end gap-2">
                  <span className="text-[44px] font-semibold leading-none tracking-tight text-white">
                    {yearly && plan.yearly !== '–' && plan.price > 0
                      ? `$${Math.round(plan.yearly / 12)}`
                      : plan.price === 0
                        ? '$0'
                        : `$${plan.price}`}
                  </span>
                  <span className="mkt-mono pb-1 text-xs text-[#686e7c]">
                    {plan.price === 0 ? 'free forever' : plan.monthlyNote}
                  </span>
                </div>
                {yearly && plan.yearly !== '–' && plan.price > 0 && (
                  <p className="mkt-mono mt-1.5 text-[11px] text-[#525764]">
                    or ${plan.yearly}/yr billed annually
                  </p>
                )}

                <Link
                  href={plan.href}
                  className={`mt-7 block rounded-lg py-3 text-center text-[14px] font-medium transition ${
                    plan.featured
                      ? 'mkt-btn-primary !border-0'
                      : 'border border-[#ffffff1a] text-white hover:border-[#2fd6e680] hover:bg-white/5'
                  }`}
                >
                  {plan.cta}
                </Link>

                <ul className="mt-8 space-y-3">
                  {plan.features.map(([label, on]) => (
                    <li key={label} className="flex items-start gap-3 text-[13px]">
                      <span
                        className={`mkt-mono mt-0.5 flex h-4 w-4 items-center justify-center text-[10px] ${
                          on ? 'text-[#2fd6e6]' : 'text-[#3a3d46]'
                        }`}
                      >
                        {on ? '✓' : '·'}
                      </span>
                      <span className={on ? 'text-[#a8adba]' : 'text-[#525764]'}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mkt-mono mt-6 text-center text-[11px] text-[#525764]">
            all prices in USD · billed via stripe · paystack · flutterwave · enterprise has custom terms
          </p>
        </section>

        {/* Compare */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto max-w-[900px] px-5 py-24 sm:px-8">
            <p className="mkt-eyebrow mb-8">
              <span className="dot">●</span> compare
            </p>
            <div className="overflow-x-auto">
              <table className="mkt-table mkt-mono min-w-[560px] text-[13px]">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Starter</th>
                    <th>Professional</th>
                    <th>Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row[0]}>
                      <td className="!text-[#eceef1]">{row[0]}</td>
                      <td>{row[1]}</td>
                      <td className={row[2].startsWith('✓') || row[2].startsWith('Advanced') ? '!text-[#2fd6e6]' : ''}>
                        {row[2]}
                      </td>
                      <td className={row[3].startsWith('✓') ? '!text-[#2fd6e6]' : ''}>{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[820px] px-5 pb-24 sm:px-8">
          <p className="mkt-eyebrow mb-8">
            <span className="dot">●</span> faq
          </p>
          <div className="divide-y divide-[#ffffff0d] border-y border-[#ffffff0d]">
            {FAQ.map(([q, a], i) => (
              <details key={q} className="group py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-medium text-white">
                  <span>{q}</span>
                  <span className="mkt-mono text-[#2fd6e6] transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[620px] text-[14px] leading-relaxed text-[#a8adba]">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <h2 className="mkt-h2 mx-auto max-w-[600px]">
              Start free. Upgrade when it matters.
            </h2>
            <p className="mkt-sub mx-auto mt-5 max-w-[420px]">
              The workspace is free forever for solo builds. Teams on a deadline start at $29/mo.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                Start building <span className="mkt-arrow">→</span>
              </Link>
              <Link href="/features" className="mkt-btn !px-7 !py-3 !text-[15px]">
                Compare features
              </Link>
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}