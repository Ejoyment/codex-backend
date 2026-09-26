/**
 * Credit Pool Service
 * 
 * Tracks AI credit usage, compute hours, and enforces monthly limits.
 * Resets credits at the beginning of each month.
 */

const Subscription = require('../models/Subscription');

class CreditPoolService {
    constructor() {
        this.resetInterval = setInterval(() => this.resetMonthlyCredits(), 60 * 60 * 1000); // Check hourly
    }

    /**
     * Check if the month has changed and reset credits if needed
     */
    async resetMonthlyCredits() {
        try {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            // Find subscriptions whose resetAt is before now
            const subscriptions = await Subscription.find({
                'creditPool.resetAt': { $lte: now },
                status: 'active'
            });

            for (const sub of subscriptions) {
                sub.creditPool.usedThisMonth = 0;
                sub.cloudComputeHours.usedThisMonth = 0;
                sub.creditPool.resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
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
     * Deduct credits from a user's pool
     * @param {string} userId - The user's ID
     * @param {number} amount - Credits to deduct
     * @returns {object} { success, overage, remaining, message }
     */
    async deductCredits(userId, amount = 1) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return { success: false, message: 'No subscription found', remaining: 0 };
        }

        // Developer tier has no credits
        if (subscription.tier === 'developer') {
            return { success: false, message: 'No cloud AI credits on Developer tier. Use BYOM.', remaining: 0 };
        }

        const monthlyLimit = subscription.getMonthlyCreditLimit();
        const used = subscription.creditPool?.usedThisMonth || 0;
        const remaining = monthlyLimit ? monthlyLimit - used : Infinity;

        if (remaining === Infinity) {
            return { success: true, overage: false, remaining: Infinity, message: 'Unlimited credits' };
        }

        if (amount > remaining) {
            if (subscription.allowPayAsYouGo) {
                subscription.creditPool.usedThisMonth += amount;
                await subscription.save();
                return {
                    success: true,
                    overage: true,
                    remaining: 0,
                    amountDeducted: amount,
                    message: `Deducted ${amount} credits (Pay-As-You-Go)`
                };
            }
            return {
                success: false,
                message: `Insufficient credits. ${used}/${monthlyLimit} used this month.`,
                remaining: remaining
            };
        }

        subscription.creditPool.usedThisMonth += amount;
        await subscription.save();
        return {
            success: true,
            overage: false,
            remaining: remaining - amount,
            amountDeducted: amount,
            message: `Deducted ${amount} credits. ${remaining - amount} remaining.`
        };
    }

    /**
     * Deduct cloud compute hours
     * @param {string} userId
     * @param {number} hours
     * @returns {object}
     */
    async deductComputeHours(userId, hours = 1) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return { success: false, message: 'No subscription found' };
        }

        const monthlyLimit = subscription.getCloudComputeHours();
        const used = subscription.cloudComputeHours?.usedThisMonth || 0;
        const remaining = monthlyLimit ? monthlyLimit - used : Infinity;

        if (remaining === Infinity) {
            return { success: true, remaining: Infinity, message: 'Unlimited compute' };
        }

        if (hours > remaining) {
            return {
                success: false,
                message: `Insufficient compute hours. ${used}/${monthlyLimit}h used.`,
                remaining
            };
        }

        subscription.cloudComputeHours.usedThisMonth += hours;
        await subscription.save();
        return {
            success: true,
            remaining: remaining - hours,
            hoursDeducted: hours
        };
    }

    /**
     * Get remaining credits for a user
     * @param {string} userId
     * @returns {object}
     */
    async getRemainingCredits(userId) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) return { tier: 'developer', remaining: 0, limit: 0 };

        const limit = subscription.getMonthlyCreditLimit();
        const used = subscription.creditPool?.usedThisMonth || 0;
        const remaining = limit !== null ? limit - used : null;

        return {
            tier: subscription.tier,
            remaining,
            limit,
            used,
            resetAt: subscription.creditPool?.resetAt
        };
    }

    /**
     * Get remaining compute hours for a user
     */
    async getRemainingCompute(userId) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) return { tier: 'developer', remaining: 0, limit: 0 };

        const limit = subscription.getCloudComputeHours();
        const used = subscription.cloudComputeHours?.usedThisMonth || 0;
        const remaining = limit !== null ? limit - used : null;

        return {
            tier: subscription.tier,
            remaining,
            limit,
            used
        };
    }

    /**
     * Check if user can delegate an agent
     */
    async canDelegateAgent(userId) {
        const subscription = await Subscription.findOne({ userId });
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
     */
    async canUseCloudCompute(userId) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) return { allowed: false };
        return { allowed: subscription.tier !== 'developer' };
    }

    /**
     * Check if user can host debug rooms
     */
    async canHostDebugRoom(userId) {
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) return { allowed: false };
        return { allowed: subscription.isDebugRoomHostAllowed() };
    }

    /**
     * Record agent execution credits and compute usage
     */
    async recordAgentExecution(userId, creditsUsed = 0, hoursUsed = 0) {
        const sub = await Subscription.findOne({ userId });
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
        clearInterval(this.resetInterval);
    }
}

module.exports = new CreditPoolService();
