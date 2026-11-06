const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

/**
 * Ensure a personal subscription exists for a user.
 * Personal workspaces are NOT companies — scoped by userId only.
 * Returns null if userId is not a valid ObjectId (e.g. test strings).
 */
async function ensurePersonalWorkspace(userId) {
    if (!mongoose.isValidObjectId(userId)) return null;
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
 * Returns null if userId is not a valid ObjectId.
 */
async function findPersonalWorkspace(userId) {
    if (!mongoose.isValidObjectId(userId)) return null;
    const doc = await Subscription.findOne({ userId, type: 'personal' });
    return doc;
}

module.exports = {
    ensurePersonalWorkspace,
    findPersonalWorkspace,
};
