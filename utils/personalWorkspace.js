const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

/**
 * Ensure a personal subscription exists for a user.
 * Personal workspaces are NOT companies — scoped by userId only.
 * Returns null if userId is not a valid ObjectId.
 */
async function ensurePersonalWorkspace(userId) {
    if (!mongoose.isValidObjectId(userId)) return null;
    let subscription = await Subscription.findOne({ userId, type: 'personal' });
    if (!subscription) {
        // Legacy: try matching by userId alone in case type was never set
        subscription = await Subscription.findOne({ userId, type: { $exists: false } });
        if (subscription) {
            subscription.type = 'personal';
            await subscription.save();
        } else {
            subscription = new Subscription({
                type: 'personal',
                userId,
                tier: 'developer',
                status: 'active',
                pricing: { amount: 0, currency: 'USD', interval: 'monthly' },
            });
            await subscription.save();
        }
    }
    return subscription;
}

/**
 * Find personal workspace (subscription) for a user.
 * Matches documents with type: 'personal' explicitly set.
 * Returns null if userId is not a valid ObjectId.
 */
async function findPersonalWorkspace(userId) {
    if (!mongoose.isValidObjectId(userId)) return null;
    const doc = await Subscription.findOne({ userId, type: 'personal' });
    return doc || null;
}

module.exports = {
    ensurePersonalWorkspace,
    findPersonalWorkspace,
};
