const Company = require('../models/Company');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { canonicalTier } = require('./tierNames');

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function workspaceNameFor(user) {
    const onboardingCompany = String(user?.company || '').trim();
    if (onboardingCompany) return onboardingCompany;
    const owner = String(user?.fullName || user?.email || '').trim();
    return owner ? `${owner}'s Workspace` : 'Personal Workspace';
}

async function findWorkspace(userId) {
    return Company.findOne({
        $or: [
            { owner: userId },
            { 'members.user': userId },
        ],
        isActive: true,
    }).sort({ createdAt: 1 });
}

async function ensurePersonalWorkspace(userId) {
    const existing = await findWorkspace(userId);
    if (existing) return existing;

    const user = await User.findById(userId).select('fullName email company');
    if (!user) {
        const error = new Error('User not found');
        error.status = 404;
        throw error;
    }

    const subscription = await Subscription.findOne({ userId }).select('tier').lean();
    const tier = canonicalTier(subscription?.tier);
    const memberLimit = tier === 'developer' ? 1 : ['pro', 'pro_plus'].includes(tier) ? 10 : 999999;
    const name = workspaceNameFor(user);
    const baseSlug = slugify(name) || `personal-${userId}`;

    let slug = baseSlug;
    const slugOwner = await Company.findOne({ slug }).select('owner').lean();
    if (slugOwner) {
        if (String(slugOwner.owner) === String(userId)) {
            return Company.findById(slugOwner._id);
        }
        slug = `${baseSlug}-${String(userId).slice(-6)}`;
    }

    try {
        return await Company.create({
            name,
            slug,
            description: '',
            owner: userId,
            members: [{
                user: userId,
                role: 'owner',
                joinedAt: new Date(),
            }],
            subscription: {
                tier,
                memberLimit,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            const raced = await findWorkspace(userId);
            if (raced) return raced;
        }
        throw error;
    }
}

module.exports = {
    ensurePersonalWorkspace,
    findPersonalWorkspace: findWorkspace,
    workspaceNameFor,
    slugify,
};
