/**
 * Credit Pool Service
 * 
 * Tracks AI credit usage, compute hours, and enforces monthly limits.
 * Resets credits at the beginning of each month.
 */

const Subscription = require('../models/Subscription');
const AgentExecution = require('../models/AgentExecution');
const { remainingFor } = require('./tierLimits');
const {
    COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR,
    DEFAULT_COMPUTE_OVERAGE_CAP_MINOR,
    overageChargeMinor,
} = require('./overagePolicy');
const teamBillingService = require('./teamBillingService');

const configuredAgentCreditCost = Number(process.env.AGENT_JOB_CREDIT_COST);
const AGENT_JOB_CREDIT_COST = Number.isFinite(configuredAgentCreditCost) && configuredAgentCreditCost > 0
    ? configuredAgentCreditCost
    : 1;

// Overage is recorded in minor units so a later invoice can use the same
// amount without re-pricing history. Billing is opt-in per subscription and
// capped monthly; see utils/overagePolicy.js.
class CreditPoolService {
    constructor() {
        // No hourly timer in tests: it keeps the jest event loop alive and
        // the reset query has no database to hit. Production boots it.
        // Ticks run under cron leadership (single instance across deploys).
        if (process.env.NODE_ENV !== 'test') {
            this.resetInterval = setInterval(() => {
                const { withLeadership } = require('./redis');
                withLeadership('creditpool-reset', 55 * 60 * 1000, () => this.resetMonthlyCredits());
            }, 60 * 60 * 1000); // Check hourly
        } else {
            this.resetInterval = null;
        }
    }

    /**
     * Check if the month has changed and reset credits if needed
     */
    async resetMonthlyCredits() {
        if (Subscription.db?.readyState !== 1) return;
        try {
            const now = new Date();
            const nextMonth = Subscription.nextMonthlyReset(now);

            // Overdue rows, legacy rows whose resetAt defaulted to Jan 1, and
            // rows missing resetAt altogether all need normalizing.
            const subscriptions = await Subscription.find({
                status: 'active',
                $or: [
                    { 'creditPool.resetAt': { $lte: now } },
                    { 'creditPool.resetAt': { $gt: nextMonth } },
                    { 'creditPool.resetAt': { $exists: false } }
                ]
            });

            for (const sub of subscriptions) {
                sub.applyMonthlyReset(now);
                await sub.save();
            }

            if (subscriptions.length > 0) {
                console.log(`CreditPoolService: Reset credits for ${subscriptions.length} subscriptions`);
            }
        } catch (error) {
            console.error('CreditPoolService reset error:', error);
        }
    }

    /**
     * Deduct credits from a user's pool or a team's pooled credits.
     *
     * @param {string} userId - The user's ID (for personal deduction)
     * @param {number} amount - Credits to deduct
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     * @returns {object} { success, overage, remaining, message }
     */
    async deductCredits(userId, amount = 1, context = {}) {
        if (context.type === 'team' && context.companyId) {
            return this.deductTeamCredits(context.companyId, amount);
        }
        return this.deductPersonalCredits(userId, amount);
    }

    /**
     * Deduct credits from a user's personal pool
     */
    async deductPersonalCredits(userId, amount = 1) {
        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) {
            return { success: false, message: 'No personal subscription found', remaining: 0 };
        }

        // Developer tier has no credits
        if (subscription.tier === 'developer') {
            return { success: false, message: 'No cloud AI credits on Developer tier. Use BYOM.', remaining: 0 };
        }

        const monthlyLimit = subscription.getMonthlyCreditLimit();
        const used = subscription.creditPool?.usedThisMonth || 0;
        const remaining = remainingFor(monthlyLimit, used);

        if (remaining === Infinity) {
            return { success: true, overage: false, remaining: Infinity, message: 'Unlimited credits' };
        }

        if (amount > remaining && !subscription.allowPayAsYouGo) {
            return {
                success: false,
                message: `Insufficient credits. ${used}/${monthlyLimit} used this month.`,
                remaining: remaining
            };
        }

        const filter = { userId, type: 'personal' };
        if (!subscription.allowPayAsYouGo) {
            filter['creditPool.usedThisMonth'] = { $lte: monthlyLimit - amount };
        }
        const updated = await Subscription.findOneAndUpdate(
            filter,
            { $inc: { 'creditPool.usedThisMonth': amount } },
            { new: true }
        );
        if (!updated) {
            return {
                success: false,
                message: 'Insufficient credits — another request used the remaining balance.',
                remaining: 0
            };
        }

        const newUsed = updated.creditPool?.usedThisMonth ?? (used + amount);
        const overage = amount > remaining;
        const remainingAfter = Math.max(0, monthlyLimit - newUsed);
        return {
            success: true,
            overage,
            remaining: remainingAfter,
            amountDeducted: amount,
            message: overage
                ? `Deducted ${amount} credits (Pay-As-You-Go).`
                : `Deducted ${amount} credits. ${remainingAfter} remaining.`
        };
    }

    /**
     * Deduct credits from a team's pooled credit pool
     */
    async deductTeamCredits(companyId, amount = 1) {
        const subscription = await Subscription.findOne({ companyId, type: 'team' });
        if (!subscription) {
            return { success: false, message: 'No team subscription found', remaining: 0 };
        }

        const limit = subscription.teamPooledCredits ?? 0;
        const used = subscription.teamCreditsUsedThisMonth ?? 0;
        const remaining = remainingFor(limit === 0 ? null : limit, used);

        if (remaining === Infinity) {
            return { success: true, overage: false, remaining: Infinity, message: 'Unlimited team credits' };
        }

        if (amount > remaining) {
            return {
                success: false,
                message: `Insufficient team credits. ${used}/${limit} used this month.`,
                remaining: remaining
            };
        }

        subscription.teamCreditsUsedThisMonth = used + amount;
        await subscription.save();
        const remainingAfter = Math.max(0, limit - used - amount);
        return {
            success: true,
            overage: false,
            remaining: remainingAfter,
            amountDeducted: amount,
            message: `Deducted ${amount} team credits. ${remainingAfter} remaining.`
        };
    }

    /**
     * Get remaining team credits
     */
    async getTeamRemainingCredits(companyId) {
        const subscription = await Subscription.findOne({ companyId, type: 'team' });
        if (!subscription) {
            return { tier: null, remaining: 0, limit: 0, hasTeam: false };
        }
        return subscription.getTeamRemainingCredits();
    }

    /**
     * Refund credits when a charged job never ran (or failed before producing
     * any work).
     */
    async refundCredits(userId, amount = 1) {
        const updated = await Subscription.findOneAndUpdate(
            { userId, 'creditPool.usedThisMonth': { $gte: amount } },
            { $inc: { 'creditPool.usedThisMonth': -amount } },
            { new: true }
        );
        if (!updated) {
            return { success: false, message: 'No charged credits to refund', remaining: 0 };
        }
        const used = updated.creditPool?.usedThisMonth || 0;
        const remaining = remainingFor(updated.getMonthlyCreditLimit(), used);
        return {
            success: true,
            amountRefunded: amount,
            remaining,
            message: `Refunded ${amount} credits.`
        };
    }

    /**
     * Deduct cloud compute hours
     * @param {string} userId
     * @param {number} hours
     * @returns {object}
     */
    async deductComputeHours(userId, hours = 1, options = {}) {
        const reservedHours = Math.max(0, Number(options.reservedHours) || 0);
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return { success: false, message: 'No subscription found' };
        }

        const monthlyLimit = subscription.getCloudComputeHours();
        if (monthlyLimit === null || monthlyLimit === undefined) {
            return { success: true, overage: false, remaining: Infinity, message: 'Unlimited compute' };
        }
        if (monthlyLimit <= 0) {
            return { success: false, message: 'Cloud compute is not included on this tier', remaining: 0 };
        }

        const used = subscription.cloudComputeHours?.usedThisMonth || 0;
        const priorOverage = subscription.cloudComputeHours?.overageHoursThisMonth || 0;
        // The preflight reservation is already included in usedThisMonth.
        // Only charge the difference between the real duration and the slice
        // that was reserved when the job started.
        const chargeableHours = hours - reservedHours;
        const nextUsed = used + chargeableHours;
        const nextOverage = Math.max(0, nextUsed - monthlyLimit);
        // Only the newly-created overage is charged; earlier overage in the
        // same month was recorded by an earlier in-flight job.
        const overageHours = Math.max(0, nextOverage - priorOverage);
        const overageEnabled = subscription.cloudComputeHours?.overageEnabled === true;
        const configuredCap = Number(subscription.cloudComputeHours?.overageCapMinor);
        const overageCapMinor = Number.isFinite(configuredCap) && configuredCap >= 0
            ? configuredCap
            : DEFAULT_COMPUTE_OVERAGE_CAP_MINOR;
        const priorAmountMinor = subscription.cloudComputeHours?.overageAmountMinor || 0;
        const charge = overageChargeMinor({
            hours: overageHours,
            priorAmountMinor,
            enabled: overageEnabled,
            capMinor: overageCapMinor,
        });
        const overageAmountMinor = charge.amountMinor;

        // Deliberately unconditional: the preflight middleware blocks NEW jobs
        // at/over the limit, while a job that started with hours remaining must
        // still be able to record its actual usage (and any overage).
        const updated = await Subscription.findOneAndUpdate(
            { userId },
            {
                $inc: {
                    'cloudComputeHours.usedThisMonth': chargeableHours,
                    'cloudComputeHours.overageHoursThisMonth': overageHours,
                    'cloudComputeHours.overageAmountMinor': overageAmountMinor
                }
            },
            { new: true }
        );
        if (!updated) {
            return { success: false, message: 'No subscription found', remaining: 0 };
        }

        const newUsed = updated.cloudComputeHours?.usedThisMonth ?? nextUsed;
        const remainingAfter = Math.max(0, monthlyLimit - newUsed);
        let overageTotalAmountMinor = updated.cloudComputeHours?.overageAmountMinor ?? priorAmountMinor + overageAmountMinor;
        if (overageEnabled && overageTotalAmountMinor > overageCapMinor) {
            // Concurrent in-flight jobs can each pass the pre-read cap check;
            // clamp the stored total so the monthly cap remains authoritative.
            overageTotalAmountMinor = overageCapMinor;
            await Subscription.updateOne(
                { userId },
                { $set: { 'cloudComputeHours.overageAmountMinor': overageCapMinor } }
            );
        }
        const overageCapped = overageEnabled && (charge.capped || overageTotalAmountMinor >= overageCapMinor);
        const billingNote = overageHours > 0
            ? overageEnabled
                ? overageCapped
                    ? ` Overage is capped at ${overageCapMinor} minor units this month.`
                    : ` Overage recorded at ${COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR} minor units/hour.`
                : ' Overage billing is disabled; no charge was recorded.'
            : '';
        return {
            success: true,
            overage: overageHours > 0,
            overageHours,
            overageAmountMinor,
            overageTotalAmountMinor,
            overageEnabled,
            overageCapMinor,
            overageCapped,
            remaining: remainingAfter,
            hoursDeducted: hours,
            message: overageHours > 0
                ? `Recorded ${hours.toFixed(4)}h compute, including ${overageHours.toFixed(4)}h overage.${billingNote}`
                : `Recorded ${hours.toFixed(4)}h compute.`
        };
    }

    /**
     * Release a preflight compute reservation that never turned into a job.
     */
    async releaseComputeHours(userId, hours = 0) {
        const amount = Number(hours);
        if (!userId || !Number.isFinite(amount) || amount <= 0) return { success: false };
        await Subscription.findOneAndUpdate(
            { userId },
            [{
                $set: {
                    'cloudComputeHours.usedThisMonth': {
                        $max: [
                            0,
                            {
                                $subtract: [
                                    { $ifNull: ['$cloudComputeHours.usedThisMonth', 0] },
                                    amount,
                                ],
                            },
                        ],
                    },
                },
            }]
        );
        return { success: true };
    }

    /**
     * Get remaining credits for a user or team
     * @param {string} userId
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     * @returns {object}
     */
    async getRemainingCredits(userId, context = {}) {
        if (context.type === 'team' && context.companyId) {
            return this.getTeamRemainingCredits(context.companyId);
        }
        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) return { tier: 'developer', remaining: 0, limit: 0 };
        return subscription.getRemainingCredits();
    }

    /**
     * Get remaining compute hours for a user or team
     * @param {string} userId
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     */
    async getRemainingCompute(userId, context = {}) {
        if (context.type === 'team' && context.companyId) {
            const subscription = await Subscription.findOne({ companyId, type: 'team' });
            if (!subscription) return { tier: 'developer', remaining: 0, limit: 0 };
            return {
                tier: subscription.tier,
                limit: null,
                used: subscription.teamCreditsUsedThisMonth || 0,
                remaining: null,
                overageHours: 0,
                overageAmountMinor: 0,
                overageEnabled: false,
                overageCapMinor: DEFAULT_COMPUTE_OVERAGE_CAP_MINOR,
                overageRateMinorPerHour: COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR
            };
        }
        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) return { tier: 'developer', remaining: 0, limit: 0 };
        return subscription.getRemainingCompute();
    }

    /**
     * Check if user can delegate an agent
     * @param {string} userId
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     */
    async canDelegateAgent(userId, context = {}) {
        if (context.type === 'team' && context.companyId) {
            const subscription = await Subscription.findOne({ companyId, type: 'team' });
            if (!subscription) return { allowed: false, reason: 'No team subscription' };

            const activeJobs = await AgentExecution.countDocuments({
                companyId,
                status: { $in: ['running', 'awaiting_approval'] }
            });
            const maxJobs = subscription.getMaxConcurrentAgentJobs();

            if (maxJobs !== null && activeJobs >= maxJobs) {
                return { allowed: false, reason: `Max ${maxJobs} concurrent team jobs reached`, activeJobs, maxJobs };
            }

            return { allowed: true, activeJobs, maxJobs };
        }

        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) return { allowed: false, reason: 'No subscription' };

        if (subscription.tier === 'developer') {
            return { allowed: false, reason: 'Developer tier: local agents only' };
        }

        const activeJobs = await AgentExecution.countDocuments({
            userId,
            status: { $in: ['running', 'awaiting_approval'] }
        });
        const maxJobs = subscription.getMaxConcurrentAgentJobs();

        if (maxJobs !== null && activeJobs >= maxJobs) {
            return { allowed: false, reason: `Max ${maxJobs} concurrent jobs reached`, activeJobs, maxJobs };
        }

        return { allowed: true, activeJobs, maxJobs };
    }

    /**
     * Check if user can use cloud compute
     * @param {string} userId
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     */
    async canUseCloudCompute(userId, context = {}) {
        if (context.type === 'team' && context.companyId) {
            const subscription = await Subscription.findOne({ companyId, type: 'team' });
            if (!subscription) return { allowed: false };
            return { allowed: subscription.tier !== 'developer' };
        }
        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) return { allowed: false };
        return { allowed: subscription.tier !== 'developer' };
    }

    /**
     * Check if user can host debug rooms
     * @param {string} userId
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     */
    async canHostDebugRoom(userId, context = {}) {
        if (context.type === 'team' && context.companyId) {
            const subscription = await Subscription.findOne({ companyId, type: 'team' });
            if (!subscription) return { allowed: false };
            return { allowed: subscription.isDebugRoomHostAllowed() };
        }
        const subscription = await Subscription.findOne({ userId, type: 'personal' });
        if (!subscription) return { allowed: false };
        return { allowed: subscription.isDebugRoomHostAllowed() };
    }

    /**
     * Record agent execution credits and compute usage
     * @param {string} userId - The user running the agent
     * @param {number} creditsUsed - Credits consumed
     * @param {number} hoursUsed - Compute hours consumed
     * @param {object} context - { type: 'personal' } or { type: 'team', companyId }
     */
    async recordAgentExecution(userId, creditsUsed = 0, hoursUsed = 0, context = {}) {
        if (context.type === 'team' && context.companyId) {
            const sub = await Subscription.findOne({ companyId, type: 'team' });
            if (!sub) return { success: false };
            if (creditsUsed > 0) {
                sub.teamCreditsUsedThisMonth = (sub.teamCreditsUsedThisMonth || 0) + creditsUsed;
            }
            await sub.save();
            return { success: true };
        }
        const sub = await Subscription.findOne({ userId, type: 'personal' });
        if (!sub || sub.tier === 'developer') return { success: false };

        if (creditsUsed > 0) {
            sub.creditPool.usedThisMonth += creditsUsed;
        }
        if (hoursUsed > 0) {
            sub.cloudComputeHours.usedThisMonth += hoursUsed;
        }
        await sub.save();
        return { success: true };
    }

    stop() {
        if (this.resetInterval) clearInterval(this.resetInterval);
        this.resetInterval = null;
    }
}

module.exports = Object.assign(new CreditPoolService(), {
    AGENT_JOB_CREDIT_COST,
    COMPUTE_OVERAGE_RATE_MINOR_PER_HOUR,
    DEFAULT_COMPUTE_OVERAGE_CAP_MINOR
});
