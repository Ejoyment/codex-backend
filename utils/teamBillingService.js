/**
 * TeamBillingService
 *
 * Manages per-seat team billing. Each team (Company) has its own Subscription
 * record (type: 'team') owned by the admin user. Seats are consumed when
 * members join and freed when they leave. AI credits are drawn from the
 * team's pooled credit pool when working in team context, and from the
 * member's personal pool when working in personal context.
 */

const Subscription = require('../models/Subscription');
const Company = require('../models/Company');
const User = require('../models/User');

class TeamBillingService {
    /**
     * Create or upgrade a team subscription. Only the company owner can do this.
     * @param {string} companyId
     * @param {string} adminUserId - must be the company owner
     * @param {string} tier - 'team_standard', 'team_premium', 'enterprise'
     * @param {string} interval - 'monthly' or 'yearly'
     * @param {number} seatCount - number of seats to purchase
     */
    async createTeamSubscription(companyId, adminUserId, tier = 'team_standard', interval = 'monthly', seatCount = 1) {
        const company = await Company.findById(companyId);
        if (!company) throw new Error('Company not found');
        if (String(company.owner) !== String(adminUserId)) {
            throw new Error('Only the company owner can create a team subscription');
        }

        const existing = await Subscription.findOne({ companyId, type: 'team' });
        if (existing) {
            // Upgrade existing team subscription
            existing.tier = tier;
            existing.teamSize = seatCount;
            existing.seats = existing.seats || [];
            await existing.save();
            company.subscription.tier = tier;
            company.subscription.memberLimit = seatCount;
            await company.save();
            return existing;
        }

        const subscription = new Subscription({
            type: 'team',
            companyId,
            userId: adminUserId, // admin owns the subscription record
            tier,
            status: 'active',
            teamSize: seatCount,
            seats: [adminUserId], // admin gets the first seat
            teamPooledCredits: 0,
            pricing: { amount: 0, currency: 'USD', interval },
        });
        await subscription.save();

        company.subscription.tier = tier;
        company.subscription.memberLimit = seatCount;
        await company.save();

        return subscription;
    }

    /**
     * Get the team subscription for a company
     */
    async getTeamSubscription(companyId) {
        return Subscription.findOne({ companyId, type: 'team' });
    }

    /**
     * Add a user to the team (consume a seat). Returns the subscription.
     * @param {string} companyId
     * @param {string} userId - user joining the team
     * @param {string} invitedBy - admin who invited
     */
    async addSeat(companyId, userId, invitedBy) {
        const company = await Company.findById(companyId);
        if (!company) throw new Error('Company not found');

        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) throw new Error('Team has no active subscription');

        // Verify the inviter is an admin/owner
        if (String(invitedBy) !== String(company.owner)) {
            const member = company.members.find((m) => String(m.user) === String(invitedBy));
            if (!member || !['owner', 'admin'].includes(member.role)) {
                throw new Error('Only company admins can invite members');
            }
        }

        // Check if user already has a seat
        if (subscription.hasSeat(userId)) {
            // Already on team - just ensure company membership
            await this._ensureCompanyMembership(company, userId);
            return subscription;
        }

        // Check seat limit
        const teamSize = subscription.teamSize || 1;
        if (subscription.seats.length >= teamSize) {
            throw new Error('Team seat limit reached. Upgrade your plan to add more seats.');
        }

        // Verify the user exists
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        // Add seat to subscription
        await subscription.addSeat(userId);

        // Add to company membership
        await this._ensureCompanyMembership(company, userId, invitedBy);

        return subscription;
    }

    /**
     * Remove a user from the team (free a seat)
     */
    async removeSeat(companyId, userId, removedBy) {
        const company = await Company.findById(companyId);
        if (!company) throw new Error('Company not found');

        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) throw new Error('Team has no active subscription');

        // Verify the remover is an admin/owner (or removing themselves)
        if (String(removedBy) !== String(userId)) {
            if (String(removedBy) !== String(company.owner)) {
                const member = company.members.find((m) => String(m.user) === String(removedBy));
                if (!member || member.role !== 'admin') {
                    throw new Error('Only company admins can remove members');
                }
            }
        }

        await subscription.removeSeat(userId);

        // Remove from company membership
        company.members = company.members.filter((m) => String(m.user) !== String(userId));
        await company.save();

        return subscription;
    }

    /**
     * Deduct credits from the team's pooled credit pool.
     * Used when an agent runs in team context.
     */
    async deductTeamCredits(companyId, amount) {
        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) {
            return { success: false, message: 'No team subscription found', remaining: 0 };
        }
        return subscription.deductTeamCredits(amount);
    }

    /**
     * Get remaining team credits
     */
    async getTeamRemainingCredits(companyId) {
        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) {
            return { tier: null, remaining: 0, limit: 0, hasTeam: false };
        }
        const info = subscription.getTeamRemainingCredits();
        info.hasTeam = true;
        return info;
    }

    /**
     * Check if a user has a seat on the team
     */
    async hasSeat(companyId, userId) {
        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) return false;
        return subscription.hasSeat(userId);
    }

    /**
     * Get all seats (user IDs) on the team
     */
    async getSeats(companyId) {
        const subscription = await this.getTeamSubscription(companyId);
        if (!subscription) return [];
        return subscription.seats;
    }

    /**
     * Ensure a user is a company member (idempotent)
     */
    async _ensureCompanyMembership(company, userId, invitedBy) {
        const existing = company.members.find((m) => String(m.user) === String(userId));
        if (existing) return;
        company.members.push({
            user: userId,
            role: 'member',
            invitedBy: invitedBy || company.owner,
            joinedAt: new Date()
        });
        await company.save();
    }
}

module.exports = new TeamBillingService();