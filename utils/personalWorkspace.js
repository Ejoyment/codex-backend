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

/**
 * Find a user's personal workspace by its stored id.
 *
 * Projects, files and agent executions store the Subscription `_id` as their
 * workspace. Authorization therefore has to resolve that id even though it is
 * not a Company. Legacy subscriptions may predate the `type` field, so the
 * lookup matches on ownership alone.
 */
async function findPersonalWorkspaceById(userId, workspaceId) {
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(workspaceId)) return null;
    return Subscription.findOne({ _id: workspaceId, userId });
}

module.exports = {
    ensurePersonalWorkspace,
    findPersonalWorkspace,
    findPersonalWorkspaceById,
};
