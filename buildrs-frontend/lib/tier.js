/**
 * Frontend mirror of backend middleware/teamRestrictions.js TIER_LIMITS
 * Do not invent limits — keep in sync with backend.
 * If backend adds a new limit, update here and surface in UI.
 */

export const TIER_LIMITS = {
  freebie: {
    maxMembers: 1,
    maxProjects: 1,
    maxTasksPerProject: 5,
    maxStorageMB: 50,
    maxIntegrations: 0,
    maxMeetingsPerMonth: 0,
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
  professional: {
    maxMembers: 10,
    maxProjects: 50,
    maxTasksPerProject: 100,
    maxStorageMB: 5000,
    maxIntegrations: 5,
    maxMeetingsPerMonth: 100,
    maxAiMessagesPerDay: 100,
    features: {
      teamChat: true,
      aiPair: true,
      advancedAnalytics: true,
      customBranding: true,
      prioritySupport: true,
      videoMeetings: true,
      codeCollaboration: true,
      integrations: true,
    },
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

export function normalizeTier(tier) {
  if (!tier) return 'freebie';
  if (tier === 'starter') return 'freebie';
  return tier;
}

export function getTierLimits(tier) {
  return TIER_LIMITS[normalizeTier(tier)] || TIER_LIMITS.freebie;
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
