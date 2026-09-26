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
  MagneticButton,
} from '../components/AnimationKit';

const TIER_BADGE = {
  developer: 'Free',
  pro: 'Popular',
  pro_plus: 'Power',
  team_standard: 'Team',
  team_premium: 'Enterprise',
  enterprise: 'Custom',
};

const TIER_BADGE_COLORS = {
  developer: 'bg-[#525764]',
  pro: 'bg-[#2fd6e6] text-[#08080b]',
  pro_plus: 'bg-[#a78bfa]',
  team_standard: 'bg-[#34d399]',
  team_premium: 'bg-[#e5b84a] text-[#08080b]',
  enterprise: 'bg-[#f87171]',
};

const PLANS = [
  {
    name: 'Developer',
    tierKey: 'developer',
    price: 0,
    monthlyNote: '/mo',
    yearly: 0,
    blurb: 'For open-source contributors, students, and evaluation.',
    cta: 'Start free',
    href: '/signup',
    badge: TIER_BADGE.developer,
    badgeColor: TIER_BADGE_COLORS.developer,
    features: [
      ['Local models via Ollama / LM Studio', true],
      ['In-browser WebContainers', true],
      ['BYOM — bring your own API keys', true],
      ['1 active preview deployment', true],
      ['1 workspace', true],
      ['Read-only spec viewing', true],
      ['Debug Rooms', 'Viewer Only'],
      ['AI credit pool', '$0 — cloud disabled'],
      ['WebRTC co-debugging', 'Disabled'],
    ],
  },
  {
    name: 'Pro',
    tierKey: 'pro',
    price: 20,
    yearlyPrice: 16,
    monthlyNote: '/mo',
    yearly: 192,
    featured: true,
    blurb: 'For solo developers coding daily.',
    cta: 'Get started',
    href: '/signup',
    badge: TIER_BADGE.pro,
    badgeColor: TIER_BADGE_COLORS.pro,
    features: [
      ['Everything in Developer', true],
      ['$20/month AI credit pool', true],
      ['Unlimited auto-mode usage', true],
      ['10 hrs/month cloud compute', true],
      ['1 concurrent agent job', true],
      ['15-minute task timeout', true],
      ['Full SDD engine (.spec.md)', true],
      ['1 active debug room (2 peers)', true],
      ['WebRTC voice co-debugging', true],
      ['3 active deployments', true],
      ['Local Privacy Mode', true],
      ['24-hour priority support', true],
    ],
  },
  {
    name: 'Pro+',
    tierKey: 'pro_plus',
    price: 60,
    yearlyPrice: 48,
    monthlyNote: '/mo',
    yearly: 576,
    blurb: 'For power users running continuous agents.',
    cta: 'Get started',
    href: '/signup',
    badge: TIER_BADGE.pro_plus,
    badgeColor: TIER_BADGE_COLORS.pro_plus,
    features: [
      ['Everything in Pro', true],
      ['$70/month AI credit pool', true],
      ['50 hrs/month cloud compute', true],
      ['3 parallel agent jobs', true],
      ['30-minute task timeout', true],
      ['Real-time AST drift detection', true],
      ['3 active debug rooms (4 peers)', true],
      ['30-day data retention', true],
      ['10 active deployments', true],
      ['Monaco gutter markers', true],
    ],
  },
  {
    name: 'Team Standard',
    tierKey: 'team_standard',
    price: 40,
    yearlyPrice: 32,
    monthlyNote: '/seat/mo',
    yearly: 384,
    blurb: 'For small-to-mid engineering teams.',
    cta: 'Contact sales',
    href: '/contact',
    badge: TIER_BADGE.team_standard,
    badgeColor: TIER_BADGE_COLORS.team_standard,
    features: [
      ['Everything in Pro+', true],
      ['$40/seat/month pooled credits', true],
      ['25 hrs/seat/month cloud compute', true],
      ['2 active jobs per seat', true],
      ['Unlimited debug rooms (4 peers)', true],
      ['20 active deployments', true],
      ['Shared Organization Spec Library', true],
      ['Role-Based Access Control (RBAC)', true],
      ['Centralized billing (Paystack, Flutterwave, Stripe)', true],
      ['Seat management & spending controls', true],
      ['Org-wide Privacy Mode', true],
    ],
  },
  {
    name: 'Team Premium',
    tierKey: 'team_premium',
    price: 120,
    yearlyPrice: 96,
    monthlyNote: '/seat/mo',
    yearly: 1152,
    blurb: 'For high-throughput engineering orgs.',
    cta: 'Contact sales',
    href: '/contact',
    badge: TIER_BADGE.team_premium,
    badgeColor: TIER_BADGE_COLORS.team_premium,
    features: [
      ['Everything in Team Standard', true],
      ['$200/seat/month pooled credits', true],
      ['120 hrs/seat/month cloud compute', true],
      ['5 parallel agent jobs per seat', true],
      ['60-minute task timeout', true],
      ['Priority queue dispatch', true],
      ['Unlimited debug rooms (8 peers)', true],
      ['Cross-repo spec engine', true],
      ['Persistent session recording', true],
      ['Automated variable redaction', true],
    ],
  },
  {
    name: 'Enterprise',
    tierKey: 'enterprise',
    price: 'Custom',
    monthlyNote: '–',
    yearly: '–',
    blurb: 'For large regulated enterprises.',
    cta: 'Contact sales',
    href: '/contact',
    badge: TIER_BADGE.enterprise,
    badgeColor: TIER_BADGE_COLORS.enterprise,
    features: [
      ['Everything in Team Premium', true],
      ['Custom pooled credits & volume discounts', true],
      ['Air-gapped gVisor / Firecracker clusters', true],
      ['Dedicated queue — no timeout', true],
      ['Custom model routing (Azure, AWS Bedrock)', true],
      ['SAML / OIDC Single Sign-On', true],
      ['SCIM automated provisioning', true],
      ['Centralized audit logging', true],
      ['99.9% uptime SLA', true],
      ['Dedicated account manager', true],
      ['Custom BAA / security agreements', true],
      ['On-premise Pinecone / Weaviate', true],
    ],
  },
];

const COMPARE = [
  ['Monthly AI Credit Pool', '$0 (BYOM Only)', '$20/month', '$70/month', '$40/seat', '$200/seat', 'Custom'],
  ['Cloud MicroVM Compute', 'Disabled', '10 hrs/mo', '50 hrs/mo', '25 hrs/seat', '120 hrs/seat', 'Custom'],
  ['Concurrent Agent Jobs', 'Local Only', '1 active', '3 parallel', '2/seat', '5/seat', 'Dedicated Queue'],
  ['Task Timeout', '5 minutes', '15 minutes', '30 minutes', '30 minutes', '60 minutes', 'No Limit'],
  ['Debug Rooms', 'Viewer Only', '1 room (2 peers)', '3 rooms (4 peers)', 'Unlimited (4)', 'Unlimited (8)', 'Custom'],
  ['Spec Engine', 'Read-Only', 'Full SDD', 'Real-Time Drift', 'Team Library', 'Cross-Repo', 'Custom'],
  ['Active Deployments', '1 (sleeps 15m)', '3', '10', '20', 'Unlimited', 'Dedicated Edge'],
  ['WebRTC Voice', 'Disabled', 'Included', 'Included', 'Included', 'Included', 'Included'],
  ['SSO / Audit Logs', '–', '–', '–', '–', '–', 'SAML + SCIM'],
  ['Local Models (BYOM)', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['In-Browser WebContainers', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
];

const FAQ = [
  ['What happens when I run out of AI credits?', 'Paid accounts automatically drop back to Unlimited Auto Mode or local BYOM. You can enable Pay-As-You-Go overages at exact API cost, or upgrade to a higher tier.'],
  ['How does team pooled credit work?', 'On Team plans, seat credits pool into a single organization balance. If one engineer burns through their allocation, others can still use the shared pool.'],
  ['Which payment methods work?', 'Buildrs bills through Stripe, Paystack, and Flutterwave. Teams in African markets (NGN, GHS, KES, ZAR) are routed to Paystack or Flutterwave automatically.'],
  ['Can I switch tiers anytime?', 'Yes. Upgrade or downgrade from Billing in your settings. Changes take effect at the start of your next billing cycle.'],
  ['Do I need a credit card for the Developer tier?', 'No. The Developer workspace is free forever with no card on file. You only add one when upgrading.'],
  ['What is Local Privacy Mode?', 'When enabled, all AI prompts and embeddings are processed locally via Ollama or LM Studio. No data leaves your machine, ever.'],
];

export default function Pricing() {
  const [yearly, setYearly] = useState(true);

  const getPrice = (plan) => {
    if (plan.price === 'Custom') return 'Custom';
    if (yearly && plan.yearlyPrice) {
      return `$${Math.round(plan.yearlyPrice)}`;
    }
    return plan.price === 0 ? '$0' : `$${plan.price}`;
  };

  const getMonthlyNote = (plan) => {
    if (plan.price === 'Custom') return '–';
    if (plan.tierKey === 'team_standard' || plan.tierKey === 'team_premium') return '/seat/mo';
    return '/mo';
  };

  return (
    <>
      <Head>
        <title>Pricing — BuildrsHQ</title>
        <meta
          name="description"
          content="6 tiers from free Developer to Enterprise. AI credit pools, cloud compute, concurrent agent jobs, debug rooms, and spec engine — all priced for your workflow."
        />
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        <MouseGlow />
        <ParticleField count={15} />
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-14 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-6">
                <span className="dot">●</span> buildrs · pricing
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mkt-h1">
                Six tiers, one
                <br />
                <span className="accent">workspace.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mkt-sub mt-6 max-w-[520px]">
                From free solo builds to enterprise-grade AI orchestration. Pick the
                tier that matches your workflow, scale when you need to.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
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
                  yearly <span className="text-[#2fd6e6]">save ~20%</span>
                </button>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Plans */}
        <section className="mx-auto max-w-[1200px] px-5 pb-20 sm:px-8">
          <StaggerChildren className="grid gap-px overflow-hidden rounded-xl border border-[#ffffff12] bg-[#ffffff12] lg:grid-cols-3" stagger={0.12}>
            {PLANS.map((plan) => (
              <StaggerItem key={plan.name}>
              <div
                className={`relative h-full bg-[#0d0d12] p-8 ${plan.featured ? 'lg:-my-4 lg:rounded-lg lg:border lg:border-[#2fd6e680] lg:bg-[#0f0f15]' : ''} ${
                  plan.featured ? 'shadow-[0_0_60px_-20px_rgba(47,214,230,0.35)]' : ''
                }`}
              >
                {plan.featured && (
                  <span className={`mkt-pill live absolute right-6 top-6 ${plan.badgeColor}`}>
                    {plan.badge}
                  </span>
                )}
                {!plan.featured && (
                  <span className={`mkt-pill absolute right-6 top-6 ${plan.badgeColor}`}>
                    {plan.badge}
                  </span>
                )}
                <p className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                  {plan.name}
                </p>
                <p className="mt-2.5 text-[13.5px] text-[#a8adba]">{plan.blurb}</p>

                <div className="mt-7 flex items-end gap-2">
                  <span className="text-[44px] font-semibold leading-none tracking-tight text-white">
                    {getPrice(plan)}
                  </span>
                  <span className="mkt-mono pb-1 text-xs text-[#686e7c]">
                    {getMonthlyNote(plan)}
                  </span>
                </div>
                {yearly && plan.yearlyPrice && plan.price !== 'Custom' && (
                  <p className="mkt-mono mt-1.5 text-[11px] text-[#525764]">
                    or ${plan.yearlyPrice}/yr billed annually
                  </p>
                )}
                {plan.price === 'Custom' && (
                  <p className="mkt-mono mt-1.5 text-[11px] text-[#525764]">
                    Contact sales for a custom quote
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
                          typeof on === 'boolean' ? (on ? 'text-[#2fd6e6]' : 'text-[#3a3d46]') : 'text-[#525764]'
                        }`}
                      >
                        {typeof on === 'boolean' ? (on ? '✓' : '·') : on}
                      </span>
                      <span className={typeof on === 'boolean' ? (on ? 'text-[#a8adba]' : 'text-[#525764]') : 'text-[#a8adba]'}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              </StaggerItem>
            ))}
          </StaggerChildren>

          <p className="mkt-mono mt-6 text-center text-[11px] text-[#525764]">
            all prices in USD · billed via stripe · paystack · flutterwave · enterprise has custom terms
          </p>
        </section>

        {/* Feature Comparison */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-8">
                <span className="dot">●</span> feature comparison
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
            <div className="overflow-x-auto">
              <table className="mkt-table mkt-mono min-w-[640px] text-[13px]">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Developer</th>
                    <th>Pro</th>
                    <th>Pro+</th>
                    <th>Team Standard</th>
                    <th>Team Premium</th>
                    <th>Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row[0]}>
                      <td className="!text-[#eceef1]">{row[0]}</td>
                      <td>{row[1]}</td>
                      <td className={row[2] !== 'Disabled' && row[2] !== 'Local Only' && row[2] !== '–' ? '!text-[#2fd6e6]' : ''}>{row[2]}</td>
                      <td className={row[3] !== '–' && row[3] !== 'Disabled' ? '!text-[#a78bfa]' : ''}>{row[3]}</td>
                      <td className={row[4] !== '–' && row[4] !== 'Disabled' ? '!text-[#34d399]' : ''}>{row[4]}</td>
                      <td className={row[5] !== '–' && row[5] !== 'Disabled' ? '!text-[#e5b84a]' : ''}>{row[5]}</td>
                      <td className="!text-[#f87171]">{row[6]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Credit Pool Mechanics */}
        <section className="border-t border-[#ffffff0d]">
          <div className="mx-auto max-w-[800px] px-5 py-24 sm:px-8">
            <ScrollReveal>
              <p className="mkt-eyebrow mb-8">
                <span className="dot">●</span> how credits work
              </p>
            </ScrollReveal>
            <StaggerChildren className="space-y-4" stagger={0.1}>
              <StaggerItem>
              <div className="bg-[#0d0d12] border border-[#ffffff0d] rounded-xl p-6">
                <h3 className="text-[15px] font-semibold text-white mb-2">Auto Mode is free on all paid plans</h3>
                <p className="text-[14px] text-[#9aa1ae]">Fast, cost-effective models route automatically. No credits burned. Only frontier models like Claude 3.5 Sonnet or GPT-4o draw from your monthly pool at published API rates.</p>
              </div>
              </StaggerItem>
              <StaggerItem>
              <div className="bg-[#0d0d12] border border-[#ffffff0d] rounded-xl p-6">
                <h3 className="text-[15px] font-semibold text-white mb-2">What happens when credits run out</h3>
                <p className="text-[14px] text-[#9aa1ae]">Paid accounts automatically drop back to Unlimited Auto Mode or local BYOM. You can enable Pay-As-You-Go overages at exact model API cost with zero markup, or upgrade to a higher tier.</p>
              </div>
              </StaggerItem>
              <StaggerItem>
              <div className="bg-[#0d0d12] border border-[#ffffff0d] rounded-xl p-6">
                <h3 className="text-[15px] font-semibold text-white mb-2">Team credits are pooled</h3>
                <p className="text-[14px] text-[#9aa1ae]">On Team plans, seat credits combine into a single organization balance. If one engineer burns through their allocation, others can still use the shared pool.</p>
              </div>
              </StaggerItem>
              <StaggerItem>
              <div className="bg-[#0d0d12] border border-[#ffffff0d] rounded-xl p-6">
                <h3 className="text-[15px] font-semibold text-white mb-2">Credits reset monthly</h3>
                <p className="text-[14px] text-[#9aa1ae]">Unused credits do not roll over. Your pool resets at the beginning of each billing cycle. Cloud compute hours follow the same monthly reset pattern.</p>
              </div>
              </StaggerItem>
            </StaggerChildren>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[820px] px-5 pb-24 sm:px-8">
          <ScrollReveal>
            <p className="mkt-eyebrow mb-8">
              <span className="dot">●</span> faq
            </p>
          </ScrollReveal>
          <StaggerChildren className="divide-y divide-[#ffffff0d] border-y border-[#ffffff0d]" stagger={0.06}>
            {FAQ.map(([q, a], i) => (
              <StaggerItem key={q}>
              <details className="group py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-medium text-white">
                  <span>{q}</span>
                  <span className="mkt-mono text-[#2fd6e6] transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[620px] text-[14px] leading-relaxed text-[#a8adba]">{a}</p>
              </details>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t border-[#ffffff0d]">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-8">
            <ScrollReveal>
              <h2 className="mkt-h2 mx-auto max-w-[600px]">
                Start free. Upgrade when it matters.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <p className="mkt-sub mx-auto mt-5 max-w-[420px]">
                The Developer tier is free forever. Teams start at $20/mo with AI credits
                and cloud compute included.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton strength={0.15}>
                  <Link href="/signup" className="mkt-btn mkt-btn-primary !px-7 !py-3 !text-[15px]">
                    Start building <span className="mkt-arrow">→</span>
                  </Link>
                </MagneticButton>
                <Link href="/features" className="mkt-btn !px-7 !py-3 !text-[15px]">
                  Compare features
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </SiteShell>
    </>
  );
}
