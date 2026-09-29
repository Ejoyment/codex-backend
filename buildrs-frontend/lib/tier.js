/**
 * Frontend mirror of backend middleware/teamRestrictions.js TIER_LIMITS
 * Do not invent limits — keep in sync with backend.
 * If backend adds a new limit, update here and surface in UI.
 */

const CORE_PAID_FEATURES = {
  teamChat: true,
  aiPair: true,
  advancedAnalytics: true,
  customBranding: true,
  prioritySupport: true,
  videoMeetings: true,
  codeCollaboration: true,
  integrations: true,
};

const FREE_LIMITS = {
  maxMembers: 1,
  maxProjects: 1,
  maxTasksPerProject: 5,
  maxStorageMB: 50,
  maxIntegrations: 0,
  maxMeetingsPerMonth: 0,
};

const PRO_LIMITS = {
  maxMembers: 10,
  maxProjects: 50,
  maxTasksPerProject: 100,
  maxStorageMB: 5000,
  maxIntegrations: 5,
  maxMeetingsPerMonth: 100,
};

const TEAM_LIMITS = {
  maxMembers: -1,
  maxProjects: -1,
  maxTasksPerProject: -1,
  maxStorageMB: -1,
  maxIntegrations: -1,
  maxMeetingsPerMonth: -1,
};

export const TIER_LIMITS = {
  developer: {
    ...FREE_LIMITS,
    maxAiMessagesPerDay: 10,
    features: {
      teamChat: false,
      aiPair: false,
      advancedAnalytics: false,
      customBranding: false,
      prioritySupport: false,
      videoMeetings: false,
      codeCollaboration: false,
      integrations: false,
    },
  },
  pro: {
    ...PRO_LIMITS,
    maxAiMessagesPerDay: 100,
    features: { ...CORE_PAID_FEATURES },
  },
  pro_plus: {
    ...PRO_LIMITS,
    maxAiMessagesPerDay: 100,
    features: { ...CORE_PAID_FEATURES },
  },
  team_standard: {
    ...TEAM_LIMITS,
    maxAiMessagesPerDay: 100,
    features: { ...CORE_PAID_FEATURES },
  },
  team_premium: {
    ...TEAM_LIMITS,
    maxAiMessagesPerDay: 100,
    features: { ...CORE_PAID_FEATURES },
  },
  enterprise: {
    maxMembers: -1,
    maxProjects: -1,
    maxTasksPerProject: -1,
    maxStorageMB: -1,
    maxIntegrations: -1,
    maxMeetingsPerMonth: -1,
    maxAiMessagesPerDay: -1,
    features: {
      teamChat: true,
      aiPair: true,
      advancedAnalytics: true,
      customBranding: true,
      prioritySupport: true,
      videoMeetings: true,
      codeCollaboration: true,
      integrations: true,
      sso: true,
      auditLogs: true,
      dedicatedSupport: true,
    },
  },
};

// Legacy tier names still present in older API responses -> canonical six.
const LEGACY_TIER_MAP = {
  freebie: 'developer',
  starter: 'developer',
  trial: 'developer',
  free: 'developer',
  basic: 'developer',
  hobby: 'developer',
  professional: 'pro',
  business: 'enterprise',
  team: 'enterprise',
};

export function normalizeTier(tier) {
  if (!tier) return 'developer';
  if (LEGACY_TIER_MAP[tier]) return LEGACY_TIER_MAP[tier];
  return TIER_LIMITS[tier] ? tier : 'developer';
}

export function getTierLimits(tier) {
  return TIER_LIMITS[normalizeTier(tier)] || TIER_LIMITS.developer;
}

export function hasFeature(tier, feature) {
  const limits = getTierLimits(tier);
  return !!limits.features[feature];
}

export function isUnlimited(value) {
  return value === -1;
}

// Backend-enforced limits that have explicit middleware / checks:
// - members: checkMemberLimit on POST /:companyId/invite (company.js)
// - aiPair: daily message limit in routes/ai-pair.js (10/100/∞)
// Other TIER_LIMITS entries (projects, tasksPerProject, integrations, meetings) exist
// in middleware but are NOT currently enforced on any route — flagged in PR description
// as "no backend limit exists for X — confirm intended behavior" per task instructions.

// ---------------------------------------------------------------------------
// Tier display
//
// The badge must name the tier the user is actually *on*, not the tier they
// would fall back to. A free trial grants Pro, so a trialing user is "Pro
// (Trial)" — showing "Free" there contradicts both the entitlements the
// backend enforces and the trial banner, which already says the user is on
// Pro. Once the trial lapses the tier falls back to developer and the badge
// reads "Free" again.
// ---------------------------------------------------------------------------

export const TIER_LABELS = {
  developer: 'Free',
  pro: 'Pro',
  pro_plus: 'Pro+',
  team_standard: 'Team Std',
  team_premium: 'Team Prem',
  enterprise: 'Enterprise',
};

export function isTrialing(subscription) {
  return Boolean(subscription?.status === 'trial');
}

export function trialDaysLeft(subscription) {
  if (!isTrialing(subscription) || !subscription?.trialEndsAt) return 0;
  const ms = new Date(subscription.trialEndsAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86400000));
}

/**
 * The tier a subscription is on, taking the first defined source. Returns null
 * while nothing is loaded so callers can show a placeholder instead of
 * claiming the user is on Free.
 */
export function resolveTier(subscription, fallbackTier) {
  const tier = subscription?.tier || fallbackTier;
  return tier ? normalizeTier(tier) : null;
}

/**
 * Badge text for the sidebar, editor status bar and plan cards.
 *   trialing  -> "Pro (Trial)" / "Pro (Trial · 12d)"
 *   paid      -> "Pro"
 *   free      -> "Free"
 *   unknown   -> "—"
 */
export function tierDisplayLabel(subscription, fallbackTier) {
  const tier = resolveTier(subscription, fallbackTier);
  if (!tier) return '—';
  const base = TIER_LABELS[tier] || TIER_LABELS.developer;
  if (!isTrialing(subscription)) return base;

  const days = trialDaysLeft(subscription);
  return days > 0 ? `${base} (Trial · ${days}d)` : `${base} (Trial)`;
}

/** Longer copy for tooltips and the environment card. */
export function tierDisplayDetail(subscription, fallbackTier) {
  const tier = resolveTier(subscription, fallbackTier);
  if (!tier) return 'Loading plan…';
  const base = TIER_LABELS[tier] || TIER_LABELS.developer;
  if (!isTrialing(subscription)) return `${base} plan`;

  const days = trialDaysLeft(subscription);
  if (days <= 0) return `${base} plan — trial ending`;
  return `${base} plan — free trial, ${days} day${days === 1 ? '' : 's'} left`;
}
