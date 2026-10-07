/**
 * Retention + array-cap policy (audit rec 11).
 *
 * Unbounded in-document arrays march toward the 16MB BSON ceiling — the
 * busiest workspace/doc becomes the outage. Caps below are enforced at every
 * write site:
 *  - silent trim (oldest dropped) for append-only history where blocking the
 *    write would break the product: file versions, terminal streams, agent
 *    logs (use trimToLast after a doc.push, or $slice in $push updates);
 *  - loud 400 for user-initiated adds that can go elsewhere: reactions,
 *    channel members, support-ticket messages.
 */
const MAX_VERSIONS = 50;
const MAX_TERMINAL_ENTRIES = 2000;
const MAX_AGENT_LOG = 500;
const MAX_TWEAKS = 100;
const MAX_REACTIONS = 200;
const MAX_CHANNEL_MEMBERS = 2000;
const MAX_TICKET_MESSAGES = 1000;

// Drop oldest entries in place so arr.length <= max. Returns arr.
function trimToLast(arr, max) {
    if (Array.isArray(arr) && arr.length > max) {
        arr.splice(0, arr.length - max);
    }
    return arr;
}

// $push spec that keeps only the last `max` elements, atomically.
function slicedPush(entry, max) {
    return { $each: [entry], $slice: -max };
}

module.exports = {
    MAX_VERSIONS,
    MAX_TERMINAL_ENTRIES,
    MAX_AGENT_LOG,
    MAX_TWEAKS,
    MAX_REACTIONS,
    MAX_CHANNEL_MEMBERS,
    MAX_TICKET_MESSAGES,
    trimToLast,
    slicedPush,
};
