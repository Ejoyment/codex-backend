// Keeps a single "you are on a trial" notification in sync with the account.
//
// Why a notification instead of a dashboard banner
// ------------------------------------------------
// The trial banner sat above the dashboard and pushed the actual work down, so
// it competed with the page it was warning about. The reminder now lives in
// the notification list (red, high priority, deep-linked to billing) and is
// owned by the server:
//
//   * one row per user, enforced by the unique (userId, dedupeKey) index;
//   * `locked: true` so the delete endpoints refuse to remove it;
//   * created while the trial is live, deleted the moment it is not.
//
// Sync runs on every notification read (list/unread-count) and on socket
// connect, which is frequent enough to keep the copy current without a cron.

const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const realtimeBus = require('./realtimeBus');
const { canonicalTier } = require('./tierNames');

const DEDUPE_KEY = 'billing:trial-active';

const PLAN_LABELS = {
    developer: 'Free',
    pro: 'Pro',
    pro_plus: 'Pro+',
    team_standard: 'Team Standard',
    team_premium: 'Team Premium',
    enterprise: 'Enterprise',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function planLabel(tier) {
    return PLAN_LABELS[canonicalTier(tier)] || 'Free';
}

function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLeft(date, now) {
    return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

function buildCopy(trial, now) {
    const plan = planLabel(trial.tier);

    if (!trial.endsAt) {
        return {
            title: `Free trial · ${plan} features active`,
            message: `You're on the ${plan} trial. Add a payment method to keep these features.`,
        };
    }

    const days = daysLeft(trial.endsAt, now);
    const ends = formatDate(trial.endsAt);

    if (days <= 0) {
        return {
            title: 'Trial ends today',
            message: `Your ${plan} trial ends today. Add a payment method to avoid losing access.`,
        };
    }

    if (days === 1) {
        return {
            title: 'Trial ends tomorrow',
            message: `Your ${plan} trial ends tomorrow (${ends}). Add a payment method to keep your features.`,
        };
    }

    return {
        title: `Trial ends in ${days} days`,
        message: `Your ${plan} trial ends ${ends}. Add a payment method to avoid interruption.`,
    };
}

/**
 * The live trial on this account, or null. Mirrors the lifecycle rules in
 * subscriptionLifecycle: only an unexpired `status: 'trial'` counts.
 */
async function activeTrial(userId) {
    const sub = await Subscription.findOne({ userId }).lean();
    if (!sub) return null;

    if (String(sub.status || '').toLowerCase() !== 'trial') return null;

    const endsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    if (endsAt && Number.isNaN(endsAt.getTime())) return null;
    if (endsAt && endsAt.getTime() <= Date.now()) return null;

    return { tier: sub.tier, endsAt };
}

/**
 * Create/refresh/remove the trial notification for one user.
 * Never throws: a notification problem must not fail the read that triggered it.
 *
 * @returns {Promise<{created: boolean, removed: boolean, notification: object|null}>}
 */
async function syncTrialNotification(userId) {
    if (!userId) return { created: false, removed: false, notification: null };
    const id = String(userId);

    try {
        const [trial, existing] = await Promise.all([
            activeTrial(id),
            Notification.findOne({ userId: id, dedupeKey: DEDUPE_KEY }),
        ]);

        if (!trial) {
            if (existing) {
                await Notification.deleteOne({ _id: existing._id });
                // Drop it from any open bell without waiting for a refetch.
                realtimeBus.emitNotificationRemoved(id, {
                    id: String(existing._id),
                    dedupeKey: DEDUPE_KEY,
                });
                return { created: false, removed: true, notification: null };
            }
            return { created: false, removed: false, notification: null };
        }

        const now = new Date();
        const { title, message } = buildCopy(trial, now);
        const data = {
            trialEndsAt: trial.endsAt ? trial.endsAt.toISOString() : null,
            tier: canonicalTier(trial.tier),
        };

        if (!existing) {
            try {
                const doc = await Notification.create({
                    userId: id,
                    type: 'trial_expiring',
                    title,
                    message,
                    priority: 'high',
                    link: '/billing',
                    dedupeKey: DEDUPE_KEY,
                    locked: true,
                    data,
                    // The read/unread state belongs to the user from here on; the
                    // row is only ever removed by sync, never by them.
                    read: false,
                });
                // No realtime emit here: this usually runs inside a notification
                // read that already returns the row. The socket sync path emits
                // explicitly when it is the one that created it.
                return { created: true, removed: false, notification: doc.toJSON() };
            } catch (error) {
                // Two reads can race (list + unread-count fire together) and the
                // unique (userId, dedupeKey) index rejects the loser. The row
                // exists either way, so this is not an error.
                if (error?.code !== 11000) throw error;
                return { created: false, removed: false, notification: null };
            }
        }

        const changed =
            existing.title !== title ||
            existing.message !== message ||
            existing.locked !== true ||
            JSON.stringify(existing.data || {}) !== JSON.stringify(data);

        if (changed) {
            existing.title = title;
            existing.message = message;
            existing.locked = true;
            existing.data = data;
            await existing.save();
        }

        return { created: false, removed: false, notification: existing.toJSON() };
    } catch (error) {
        console.error('[notifications] trial sync failed:', error.message);
        return { created: false, removed: false, notification: null };
    }
}

module.exports = { syncTrialNotification, DEDUPE_KEY, activeTrial };
