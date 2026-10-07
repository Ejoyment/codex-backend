/**
 * Single source of truth for tier limits (audit rec 12).
 *
 * Three tables used to encode the same numbers with different conventions
 * (Subscription getters with Infinity, canUseFeature with null, enforcement
 * middleware with inline checks) — enforcement disagreed with displayed
 * entitlements per path. Convention: `null` means unlimited/custom
 * (enterprise). Never store Infinity; the helpers below normalize for
 * arithmetic. Unknown tiers resolve to null (fail open would be worse — but
 * upgradeTo() only writes canonical tiers, so this path should not happen).
 */
const TIER_LIMITS = {
    developer: {
        monthlyCredits: 0,
        cloudComputeHours: 0,
        maxConcurrentAgentJobs: 0,
        taskTimeoutMinutes: 5,
        maxDebugHostRooms: 0,
        maxDebugParticipants: 0,
        maxActiveDeployments: 1,
    },
    pro: {
        monthlyCredits: 20,
        cloudComputeHours: 10,
        maxConcurrentAgentJobs: 1,
        taskTimeoutMinutes: 15,
        maxDebugHostRooms: 1,
        maxDebugParticipants: 2,
        maxActiveDeployments: 3,
    },
    pro_plus: {
        monthlyCredits: 70,
        cloudComputeHours: 50,
        maxConcurrentAgentJobs: 3,
        taskTimeoutMinutes: 30,
        maxDebugHostRooms: 3,
        maxDebugParticipants: 4,
        maxActiveDeployments: 10,
    },
    team_standard: {
        monthlyCredits: 40,
        cloudComputeHours: 25,
        maxConcurrentAgentJobs: 2,
        taskTimeoutMinutes: 30,
        maxDebugHostRooms: null,
        maxDebugParticipants: 4,
        maxActiveDeployments: 20,
    },
    team_premium: {
        monthlyCredits: 200,
        cloudComputeHours: 120,
        maxConcurrentAgentJobs: 5,
        taskTimeoutMinutes: 60,
        maxDebugHostRooms: null,
        maxDebugParticipants: 8,
        maxActiveDeployments: null,
    },
    enterprise: {
        monthlyCredits: null,
        cloudComputeHours: null,
        maxConcurrentAgentJobs: null,
        taskTimeoutMinutes: null,
        maxDebugHostRooms: null,
        maxDebugParticipants: null,
        maxActiveDeployments: null,
    },
};

function limitFor(tier, key) {
    const row = TIER_LIMITS[tier];
    if (!row || !(key in row)) return null;
    return row[key];
}

// True when `used` more is allowed: unlimited tiers always pass.
function limitAllows(limit, used) {
    if (limit === null || limit === undefined) return true;
    return used < limit;
}

// Remaining quota; Infinity when unlimited.
function remainingFor(limit, used) {
    if (limit === null || limit === undefined) return Infinity;
    return limit - used;
}

module.exports = { TIER_LIMITS, limitFor, limitAllows, remainingFor };
