/**
 * Canonical plan catalog — the single source of truth for plan names, prices,
 * and copy across checkout and the settings billing tab.
 *
 * These were previously hardcoded inside pages/checkout.js, which meant the
 * billing tab had no way to show real prices and the two surfaces could drift.
 * Backend tier names must match `id` exactly (see utils/tierNames.js TIERS).
 */

export const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 20,
    yearlyPrice: 192,
    monthlyNote: '/mo',
    yearlyNote: '/yr',
    blurb: 'For individual builders shipping fast.',
    featured: true,
    features: [
      '100 AI messages/day · AI pair enabled',
      '20 AI credits · 10 cloud hours/mo',
      '1 debug room · real-time co-editing',
      'GitHub · Slack · Discord integrations',
      'Priority support',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro+',
    monthlyPrice: 60,
    yearlyPrice: 576,
    monthlyNote: '/mo',
    yearlyNote: '/yr',
    blurb: 'For power users who live in the IDE.',
    featured: false,
    features: [
      'Everything in Pro',
      '70 AI credits · 50 cloud hours/mo',
      '3 debug rooms · 10 deployments/mo',
      'Real-time drift spec engine',
      '30-day data retention',
    ],
  },
  {
    id: 'team_standard',
    name: 'Team Standard',
    monthlyPrice: 40,
    yearlyPrice: 384,
    monthlyNote: '/seat/mo',
    yearlyNote: '/yr',
    perSeat: true,
    blurb: 'For small teams shipping together.',
    featured: false,
    features: [
      'Everything in Pro+',
      'Unlimited members & projects',
      'Team spec library · team RBAC',
      '25 cloud hours/mo · 20 deployments/mo',
      'Unlimited debug rooms (4 peers)',
    ],
  },
  {
    id: 'team_premium',
    name: 'Team Premium',
    monthlyPrice: 120,
    yearlyPrice: 1152,
    monthlyNote: '/seat/mo',
    yearlyNote: '/yr',
    perSeat: true,
    blurb: 'For orgs that need it all.',
    featured: false,
    features: [
      'Everything in Team Standard',
      '200 AI credits · 120 cloud hours/mo',
      'Unlimited deployments · cross-repo specs',
      '8-peer debug rooms · 90-day retention',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: null,
    yearlyPrice: null,
    monthlyNote: '',
    yearlyNote: '',
    blurb: 'For orgs with compliance to meet.',
    featured: false,
    contactSales: true,
    features: [
      'Everything in Team Premium',
      'SSO authentication',
      'Audit logs · SCIM provisioning',
      'Dedicated account manager',
      'Custom contracts · SOC 2-ready',
    ],
  },
];

/** Cheapest first. Must match backend TIER_ORDER in utils/subscriptionLifecycle.js. */
export const PLAN_ORDER = ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];

export const FREE_PLAN = {
  id: 'developer',
  name: 'Free',
  monthlyPrice: 0,
  yearlyPrice: 0,
  monthlyNote: '/mo',
  yearlyNote: '/yr',
  blurb: 'Explore BuildrsHQ with a single project.',
  featured: false,
  features: [
    '1 project · 1 member',
    '5 tasks per project',
    '50 MB storage',
    'Core build & deploy',
  ],
};

export const ALL_PLANS = [FREE_PLAN, ...PLANS];

export function planById(id) {
  return ALL_PLANS.find((p) => p.id === id) || null;
}

export function planName(id) {
  const plan = planById(id);
  return plan ? plan.name : 'Free';
}

export function planRank(id) {
  const index = PLAN_ORDER.indexOf(id);
  return index === -1 ? 0 : index;
}

/**
 * 'upgrade' | 'downgrade' | 'current' — mirrors backend planDirection so the
 * settings tab and the API never disagree about what a "downgrade" is.
 */
export function planDirection(fromId, toId) {
  const from = planRank(fromId);
  const to = planRank(toId);
  if (to > from) return 'upgrade';
  if (to < from) return 'downgrade';
  return 'current';
}

/** Dollar amount for a plan/interval pair, or null for quoted plans. */
export function planPrice(id, interval = 'yearly') {
  const plan = planById(id);
  if (!plan) return null;
  if (plan.contactSales) return null;
  return interval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

/** Savings of yearly over monthly, used for the "2 months free" badge. */
export function yearlySavingsPercent(id) {
  const plan = planById(id);
  if (!plan || plan.contactSales || !plan.monthlyPrice || !plan.yearlyPrice) return 0;
  const fullYearMonthly = plan.monthlyPrice * 12;
  return Math.round(((fullYearMonthly - plan.yearlyPrice) / fullYearMonthly) * 100);
}
