const Subscription = require('../models/Subscription');

/**
 * Ensure a personal subscription exists for a user.
 * Personal workspaces are NOT companies — scoped by userId only.
 */
async function ensurePersonalWorkspace(userId) {
    let subscription = await Subscription.findOne({ userId, type: 'personal' });
    if (!subscription) {
        subscription = new Subscription({
            type: 'personal',
            userId,
            tier: 'developer',
            status: 'active',
            pricing: { amount: 0, currency: 'USD', interval: 'monthly' },
        });
        await subscription.save();
    }
    return subscription;
}

/**
 * Find personal workspace (subscription) for a user.
 */
async function findPersonalWorkspace(userId) {
    return Subscription.findOne({ userId, type: 'personal' });
}

module.exports = {
    ensurePersonalWorkspace,
    findPersonalWorkspace,
};
