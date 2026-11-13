// Structural ceiling, not a pricing decision: an embedded members array can
// otherwise grow toward Mongo's 16MB document limit. Paid team tiers still use
// the seat count recorded on subscription.memberLimit.
const MAX_COMPANY_MEMBERS = 1000;

function cappedMemberLimit(limit) {
    const numeric = Number(limit);
    if (!Number.isFinite(numeric) || numeric <= 0) return MAX_COMPANY_MEMBERS;
    return Math.min(Math.floor(numeric), MAX_COMPANY_MEMBERS);
}

// Tier changes must not discard a purchased seat count on a team tier.
function resolveMemberLimit(tier, currentLimit) {
    if (tier === 'developer') return 1;
    if (tier === 'pro' || tier === 'pro_plus') return 10;
    const purchased = Number(currentLimit);
    if (Number.isFinite(purchased) && purchased > 0) {
        return Math.min(Math.floor(purchased), MAX_COMPANY_MEMBERS);
    }
    return MAX_COMPANY_MEMBERS;
}

module.exports = {
    MAX_COMPANY_MEMBERS,
    cappedMemberLimit,
    resolveMemberLimit,
};
