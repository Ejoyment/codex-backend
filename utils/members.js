/**
 * Member-reference normalization (decision: unify on { user } subdocs).
 *
 * Channel/Company members are `{ user, role }` subdocs; LocalProject and
 * TeamProject historically store bare ObjectIds. Readers must accept both
 * until the backfill (scripts/backfill-members.js --apply) converts legacy
 * rows. Writers of NEW rows must use { user } subdocs.
 */

function memberUserId(m) {
    if (!m) return null;
    if (typeof m === 'string') return m;
    // Subdoc { user } first: populated subdocs also carry their own _id,
    // which is NOT the user.
    if (m.user !== undefined && m.user !== null) {
        const u = m.user;
        if (typeof u === 'string') return u;
        if (u._id) return String(u._id);
        if (typeof u.toString === 'function' && u.toString() !== '[object Object]') return u.toString();
        return null;
    }
    if (m._id) return String(m._id);
    if (typeof m.toString === 'function' && m.toString() !== '[object Object]') return m.toString();
    return null;
}

// Normalize any members array to [{ user: <idString> }] (drops unresolvable).
function normalizeMembers(members) {
    if (!Array.isArray(members)) return [];
    const out = [];
    for (const m of members) {
        const id = memberUserId(m);
        if (id) out.push({ user: id });
    }
    return out;
}

// Matches a user id against either shape (for queries).
function memberMatch(userId) {
    return { $or: [{ members: userId }, { 'members.user': userId }] };
}

module.exports = { memberUserId, normalizeMembers, memberMatch };
