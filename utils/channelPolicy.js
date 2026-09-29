/**
 * Channel visibility and posting rules, shared by every feature that writes
 * into a messaging channel (channel CRUD, messaging, standups).
 */

const CHANNEL_TYPES = ['public', 'private', 'direct', 'announcement'];

const CHANNEL_TYPE_ALIASES = {
    group: 'public',
    channel: 'public',
    public: 'public',
    private: 'private',
    direct: 'direct',
    announcement: 'announcement',
};

function normalizeChannelType(type) {
    if (type == null || type === '') return 'public';
    const key = String(type).trim().toLowerCase();
    return CHANNEL_TYPE_ALIASES[key] || null;
}

function isChannelMember(channel, userId) {
    return (channel.members || []).some(m => String(m.user?._id || m.user) === String(userId));
}

function channelRole(channel, userId) {
    const membership = (channel.members || []).find(
        m => String(m.user?._id || m.user) === String(userId)
    );
    return membership ? membership.role : null;
}

/**
 * Announcement channels are readable company-wide but only channel admins may
 * post. Everything else requires channel membership.
 */
function canPostToChannel(channel, userId) {
    const role = channelRole(channel, userId);
    if (!role) return { ok: false, reason: 'Access denied: not a channel member' };
    if (channel.type === 'announcement' && role !== 'admin') {
        return { ok: false, reason: 'Only channel admins can post in announcement channels' };
    }
    return { ok: true, role };
}

module.exports = {
    CHANNEL_TYPES,
    CHANNEL_TYPE_ALIASES,
    normalizeChannelType,
    isChannelMember,
    channelRole,
    canPostToChannel,
};
