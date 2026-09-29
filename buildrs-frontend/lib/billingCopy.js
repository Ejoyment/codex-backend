/**
 * Billing copy and plan-change impact.
 *
 * Every string a user reads about their money lives here, derived from real
 * limits (lib/tier.js) and the API's derived billing state
 * (GET /api/subscription/current -> `state`), so the tab cannot promise
 * something the backend does not do.
 *
 * The rule that shaped this file: never tell a user they will keep something
 * the code is about to take away. The old billing tab said "you'll lose access
 * at the end of the billing period" while /cancel revoked access immediately.
 * `cancelCopy` now reports the real behaviour, whichever branch runs.
 */

import { TIER_LIMITS, normalizeTier, isUnlimited } from './tier';
import { planById, planName, planDirection } from './plans';

const LIMIT_LABELS = {
  maxMembers: 'Team members',
  maxProjects: 'Projects',
  maxTasksPerProject: 'Tasks per project',
  maxStorageMB: 'Storage',
  maxIntegrations: 'Integrations',
  maxMeetingsPerMonth: 'Video meetings / month',
  maxAiMessagesPerDay: 'AI messages / day',
};

const FEATURE_LABELS = {
  teamChat: 'Team chat',
  aiPair: 'AI pair programming',
  advancedAnalytics: 'Advanced analytics',
  customBranding: 'Custom branding',
  prioritySupport: 'Priority support',
  videoMeetings: 'Video meetings',
  codeCollaboration: 'Real-time code collaboration',
  integrations: 'Integrations',
  sso: 'SSO',
  auditLogs: 'Audit logs',
  dedicatedSupport: 'Dedicated support',
};

function formatLimit(key, value) {
  if (isUnlimited(value)) return 'Unlimited';
  if (key === 'maxStorageMB') {
    if (value >= 1000) return `${Math.round(value / 1000)} GB`;
    return `${value} MB`;
  }
  return String(value);
}

/**
 * Comparable value for a limit. `-1` means unlimited, which is the *best*
 * possible value — comparing it numerically made a move from Team Premium
 * (unlimited members) to Pro (10) read as a gain instead of a loss.
 */
function comparableLimit(value) {
  if (isUnlimited(value)) return Number.POSITIVE_INFINITY;
  return value;
}

function limitsOf(tier) {
  return TIER_LIMITS[normalizeTier(tier)] || TIER_LIMITS.developer;
}

/**
 * What the user gains and loses moving between two plans.
 * Returns { gains, losses, direction } where each entry is
 * { label, from, to } for readable confirmation dialogs.
 */
export function planImpact(fromTier, toTier) {
  const from = limitsOf(fromTier);
  const to = limitsOf(toTier);
  const direction = planDirection(normalizeTier(fromTier), normalizeTier(toTier));

  const gains = [];
  const losses = [];

  Object.keys(LIMIT_LABELS).forEach((key) => {
    const a = from[key];
    const b = to[key];
    if (a === undefined || b === undefined || a === b) return;
    // Higher is better for every limit we track, so a drop is a loss.
    const entry = {
      label: LIMIT_LABELS[key],
      from: formatLimit(key, a),
      to: formatLimit(key, b),
    };
    if (comparableLimit(b) > comparableLimit(a)) gains.push(entry);
    else losses.push(entry);
  });

  const fromFeatures = from.features || {};
  const toFeatures = to.features || {};
  Object.keys(FEATURE_LABELS).forEach((key) => {
    const had = !!fromFeatures[key];
    const has = !!toFeatures[key];
    if (had === has) return;
    const entry = { label: FEATURE_LABELS[key], from: had ? 'Included' : '—', to: has ? 'Included' : '—' };
    if (has) gains.push(entry);
    else losses.push(entry);
  });

  return { direction, gains, losses };
}

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export { formatDate, formatDateTime };

/** Fraction of the trial window already used, for the progress bar. */
export function trialProgress(state, trialLengthDays = 14) {
  if (!state || !state.isTrialing) return 0;
  const used = trialLengthDays - state.trialDaysLeft;
  const ratio = trialLengthDays > 0 ? used / trialLengthDays : 1;
  return Math.min(1, Math.max(0, ratio));
}

/** Headline status pill text. */
export function statusMeta(state) {
  if (!state) return { label: 'Loading…', tone: 'neutral' };
  switch (state.phase) {
    case 'trial':
      return {
        label: `Free trial · ${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? '' : 's'} left`,
        tone: 'trial',
      };
    case 'active':
      return { label: 'Active', tone: 'active' };
    case 'canceling':
      return { label: 'Cancels at period end', tone: 'warning' };
    case 'changing':
      return { label: `Switches to ${planName(state.pendingTier)} at period end`, tone: 'warning' };
    case 'past_due':
      return { label: 'Payment failed', tone: 'danger' };
    case 'expired':
      return { label: 'Expired', tone: 'danger' };
    default:
      return { label: 'Free', tone: 'neutral' };
  }
}

/**
 * Consequences of cancelling, stated truthfully.
 *
 * `state.cancelIsImmediate` comes from the API, which decides it from the real
 * period end. A trial or an expired plan cancels now; a paid plan keeps access
 * until the period it was already paid for runs out.
 */
export function cancelCopy(state) {
  if (!state) return null;
  const plan = planName(state.tier);
  const when = formatDate(state.changeEffectiveAt || state.endDate);

  if (state.cancelIsImmediate) {
    if (state.isTrialing) {
      return {
        immediate: true,
        title: 'End your free trial?',
        body: `Your ${plan} trial ends right away and you move to the Free plan. You can restart a trial later, but anything above the Free limits stops working immediately.`,
        effectiveLine: 'Free plan, immediately',
        confirmLabel: 'End trial',
      };
    }
    return {
      immediate: true,
      title: `Move to the Free plan?`,
      body: `You will drop from ${plan} to Free immediately and will not be billed again.`,
      effectiveLine: 'Free plan, immediately',
      confirmLabel: 'Move to Free',
    };
  }

  return {
    immediate: false,
    title: `Cancel your ${plan} plan?`,
    body: `You keep full ${plan} access until ${when}. After that you move to the Free plan and will not be charged again. You can resume any time before then.`,
    effectiveLine: when ? `Free plan on ${when}` : 'At the end of your billing period',
    confirmLabel: 'Cancel at period end',
  };
}

/** Copy for scheduling a move to a cheaper plan. */
export function downgradeCopy(state, toTier) {
  const impact = planImpact(state?.tier, toTier);
  const when = formatDate(state?.endDate);
  const target = planName(toTier);
  const list = impact.losses.length
    ? impact.losses.map((l) => `${l.label}: ${l.from} → ${l.to}`).join(' · ')
    : 'fewer limits and features';
  return {
    title: `Move to ${target}?`,
    body: state?.cancelIsImmediate
      ? `You will move to ${target} immediately. You lose ${list}.`
      : `You will move to ${target} on ${when || 'the next renewal'} and keep your current limits until then. You lose ${list}.`,
    losses: impact.losses,
    effectiveLine: state?.cancelIsImmediate ? 'Immediately' : `On ${when || 'renewal'}`,
    confirmLabel: `Move to ${target}`,
  };
}

/** "Nothing is lost, you gain X" — used for upgrades, which are priced. */
export function upgradeCopy(state, toTier, interval = 'yearly') {
  const target = planName(toTier);
  const impact = planImpact(state?.tier, toTier);
  const plan = planById(toTier);
  const price = plan ? (interval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice) : null;
  const note = plan?.perSeat ? '/seat' : '';
  const gains = impact.gains.length
    ? impact.gains.map((g) => `${g.label}: ${g.from} → ${g.to}`).join(' · ')
    : 'more headroom';
  return {
    title: `Upgrade to ${target}?`,
    body: `You gain ${gains}. Your new plan starts today${price != null ? ` at $${price}${note}/${interval === 'yearly' ? 'yr' : 'mo'}` : ''}.`,
    gains: impact.gains,
    price,
  };
}

/** One-line summary of what happens to the plan on the given date. */
export function renewalCopy(state) {
  if (!state) return null;
  if (state.phase === 'trial') {
    const when = formatDate(state.trialEndsAt);
    return when
      ? `Trial ends ${when}. You move to Free unless you upgrade.`
      : 'Trial ending — upgrade to keep your current limits.';
  }
  if (state.phase === 'canceling') {
    const when = formatDate(state.changeEffectiveAt);
    return when ? `You keep ${planName(state.tier)} until ${when}, then move to Free.` : 'Your plan will end at the close of this period.';
  }
  if (state.phase === 'changing') {
    const when = formatDate(state.changeEffectiveAt);
    return when
      ? `You keep ${planName(state.tier)} until ${when}, then switch to ${planName(state.pendingTier)}.`
      : `You will switch to ${planName(state.pendingTier)} at your next renewal.`;
  }
  if (state.phase === 'past_due') {
    return 'We could not charge your payment method. Update it to avoid losing access.';
  }
  if (state.phase === 'active') {
    const when = formatDate(state.endDate || state.nextBillingDate);
    return when ? `Renews ${when}.` : 'Renews automatically each period.';
  }
  if (state.phase === 'expired') {
    return 'This plan has expired. Pick a plan to restore your limits.';
  }
  return 'You are on the Free plan.';
}

/** Test seam: the date label used for a phase's headline date. */
export function phaseDate(state) {
  if (!state) return null;
  if (state.phase === 'trial') return formatDateTime(state.trialEndsAt);
  if (state.phase === 'canceling' || state.phase === 'changing') return formatDate(state.changeEffectiveAt);
  return formatDate(state.endDate || state.nextBillingDate);
}
