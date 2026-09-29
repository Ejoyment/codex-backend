/**
 * Subscription lifecycle: the single source of truth for "what state is this
 * user actually in, and when does it change".
 *
 * Why this module exists
 * ---------------------
 * The billing UI and the billing API had drifted apart, which produced silent
 * failures that only surfaced as wrong copy in Settings:
 *   - the UI read `status === 'trialing'` but the model enum has always been
 *     `status === 'trial'`, so trial banners never rendered;
 *   - the UI read `trialEnd` but the field is `trialEndsAt`;
 *   - the UI told users cancelling "you'll lose access at the end of the
 *     billing period" while /cancel downgraded them to developer immediately;
 *   - /cancel wrote `cancelledAt` and /upgrade wrote `endDate`, but neither
 *     field was ever declared on the schema, so Mongoose strict mode dropped
 *     both writes and paid subscriptions had no period end at all.
 *
 * Rather than patch each of those symptoms independently, the API now derives
 * one billing state via describeState() and the UI renders only that shape.
 * Adding a field here surfaces in both places at once, so they cannot drift.
 *
 * Design rules
 * ------------
 * 1. A paid downgrade or cancellation is never applied early. The user keeps
 *    their entitlements until `changeEffectiveAt`, then drops automatically.
 * 2. A trial cancellation IS immediate — there is nothing paid to protect, and
 *    "cancel" on a trial must mean "stop the trial", not "schedule a downgrade
 *    from a plan you never bought".
 * 3. Nothing here throws. A billing-state read must never break a page render.
 */

const { canonicalTier, isPaidTier } = require('./tierNames');

const DAY_MS = 24 * 60 * 60 * 1000;

const FREE_TIER = 'developer';

/**
 * Canonical ordering, cheapest first. Used to tell an upgrade from a
 * downgrade and to pick the "next step up" for a trialing user.
 * Enterprise stays last: it is quoted, not self-serve.
 */
const TIER_ORDER = ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];

/**
 * Plans that a user can actually buy without a sales conversation.
 * Enterprise is deliberately excluded — the UI offers "Talk to sales" for it
 * instead of a checkout button it cannot fulfil.
 */
const SELF_SERVE_TIERS = ['pro', 'pro_plus', 'team_standard', 'team_premium'];

function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from, to) {
    return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * The end of the period the user has already paid for, if any.
 * Checks endDate first, then the recurring nextBillingDate, then trialEndsAt,
 * so documents written before those fields existed still resolve.
 *
 * `trialEndsAt` is only consulted while the subscription is actually trialing.
 * It is a historical record, and treating a leftover trial date on a cancelled
 * document as a live period made a cancelled plan report a future period end
 * and claim cancelling it was not immediate.
 */
function currentPeriodEnd(subscription) {
    if (!subscription) return null;
    const isTrialing = String(subscription.status || '').toLowerCase() === 'trial';
    const candidates = [
        toDate(subscription.endDate),
        toDate(subscription.nextBillingDate),
        isTrialing ? toDate(subscription.trialEndsAt) : null,
    ].filter(Boolean);
    if (!candidates.length) return null;
    return candidates.reduce((latest, date) => (date > latest ? date : latest), candidates[0]);
}

function planRank(tier) {
    const index = TIER_ORDER.indexOf(canonicalTier(tier));
    return index === -1 ? 0 : index;
}

/**
 * 'upgrade' | 'downgrade' | 'current'
 * Comparing by rank rather than price keeps seat-per-month plans from being
 * mislabelled when a team plan costs more per seat than a solo plan.
 */
function rawStatusOf(subscription) {
    return String((subscription && subscription.status) || 'active').toLowerCase();
}

function planDirection(fromTier, toTier) {
    const from = planRank(fromTier);
    const to = planRank(toTier);
    if (to > from) return 'upgrade';
    if (to < from) return 'downgrade';
    return 'current';
}

/**
 * Does this subscription still hold paid entitlements? True while trialing and
 * while a paid plan is active, including the window between "cancel" and the
 * period actually ending. False once a change has been applied.
 */
function hasEntitlement(subscription) {
    if (!subscription) return false;
    const status = String(subscription.status || '').toLowerCase();
    if (status === 'active' || status === 'trial') return true;
    if (status === 'past_due') return true;
    return false;
}

/**
 * True while a paid plan remains usable but is on its way out. Callers should
 * surface this prominently but must not treat it as a downgrade yet.
 */
function isPendingChange(subscription) {
    if (!subscription) return false;
    if (subscription.cancelAtPeriodEnd) return true;
    return Boolean(subscription.pendingTier);
}

/**
 * Apply a due scheduled change, in place.
 *
 * Called on read paths (GET /current, entitlement) rather than from a
 * background job, matching how trial expiry already works in
 * middleware/trial.js — the transition happens the moment anyone looks, and
 * needs no scheduler to stay honest.
 *
 * Returns true when the document was mutated and must be saved.
 */
function applyPendingChanges(subscription, now = new Date()) {
    if (!subscription) return false;
    const effective = toDate(subscription.changeEffectiveAt);
    if (!effective || effective > now) return false;

    let changed = false;

    if (subscription.pendingTier) {
        const target = canonicalTier(subscription.pendingTier);
        if (target !== subscription.tier) {
            subscription.upgradeTo(target);
            // A scheduled downgrade to a paid tier or a same-day switch to a
            // different plan is an upgrade; keep the status coherent.
            if (subscription.status === 'cancelled' || subscription.status === 'expired') {
                subscription.status = 'active';
            }
            changed = true;
        }
    } else if (subscription.cancelAtPeriodEnd) {
        // Cancel without a replacement plan: drop to Free and end billing.
        if (subscription.tier !== FREE_TIER) {
            subscription.upgradeTo(FREE_TIER);
            changed = true;
        }
        if (subscription.status === 'active' || subscription.status === 'trial') {
            subscription.status = 'cancelled';
            changed = true;
        }
    }

    if (changed) {
        subscription.cancelAtPeriodEnd = false;
        subscription.pendingTier = undefined;
        subscription.changeEffectiveAt = undefined;
        // A trialing subscription that transitioned off trial keeps no trial
        // dates, so the UI can never render a stale countdown.
        if (rawStatusOf(subscription) !== 'trial') subscription.trialEndsAt = undefined;
    }

    return changed;
}

/**
 * Derive the full billing state the UI renders.
 *
 * Returns plain JSON-safe values — no Mongoose documents — so the shape is
 * testable in isolation and identical for every consumer.
 */
function describeState(subscription, now = new Date()) {
    const tier = canonicalTier(subscription && subscription.tier);
    const rawStatus = String((subscription && subscription.status) || 'active').toLowerCase();
    const periodEnd = currentPeriodEnd(subscription);
    const changeEffective = toDate(subscription && subscription.changeEffectiveAt);
    const trialEnds = toDate(subscription && subscription.trialEndsAt);

    const isTrialing = rawStatus === 'trial' && Boolean(trialEnds) && trialEnds > now;
    const isPaid = isPaidTier(tier);
    const cancelAtPeriodEnd = Boolean(subscription && subscription.cancelAtPeriodEnd);
    const pendingTier = subscription && subscription.pendingTier ? canonicalTier(subscription.pendingTier) : null;

    // A trialing user has paid nothing, so cancelling them is immediate. A paid
    // user keeps what they bought until the period ends.
    const canCancel = rawStatus === 'trial' || isPaid;
    const cancelIsImmediate = rawStatus === 'trial' || !periodEnd || periodEnd <= now;

    const state = {
        tier,
        // Normalise to the vocabulary the UI switches on. `trialing` is
        // reported as `trial` because that is the model's canonical value.
        status: rawStatus,
        isTrialing,
        isPaid,
        isFree: tier === FREE_TIER,
        hasEntitlement: hasEntitlement(subscription),

        // Display
        pricing: subscription && subscription.pricing
            ? {
                amount: subscription.pricing.amount,
                interval: subscription.pricing.interval,
                label: `$${subscription.pricing.amount}/${subscription.pricing.interval}`,
            }
            : null,
        paymentProvider: (subscription && subscription.paymentProvider) || null,

        // Dates
        startDate: toDate(subscription && subscription.startDate),
        endDate: periodEnd,
        trialEndsAt: trialEnds,
        nextBillingDate: toDate(subscription && subscription.nextBillingDate),
        changeEffectiveAt: changeEffective,
        cancelledAt: toDate(subscription && subscription.cancelledAt),

        // Countdown
        trialDaysLeft: isTrialing ? daysBetween(now, trialEnds) : 0,
        periodDaysLeft: periodEnd && periodEnd > now ? daysBetween(now, periodEnd) : 0,

        // Pending change
        cancelAtPeriodEnd,
        pendingTier,
        hasPendingChange: isPendingChange(subscription),
        cancelEffectiveAt: cancelAtPeriodEnd ? changeEffective : null,

        // Capabilities — the UI must not infer these, because getting them
        // wrong is what produced the always-broken trial buttons.
        canCancel,
        cancelIsImmediate,
        canResume: cancelAtPeriodEnd || Boolean(pendingTier),
        canChangePlan: isTrialing || isPaid || rawStatus === 'cancelled' || rawStatus === 'expired' || rawStatus === 'past_due',
        selfServeTiers: SELF_SERVE_TIERS,
    };

    // A single derived label the UI can branch on without re-deriving logic.
    if (isTrialing) state.phase = 'trial';
    else if (cancelAtPeriodEnd) state.phase = 'canceling';
    else if (pendingTier) state.phase = 'changing';
    else if (rawStatus === 'active' && isPaid) state.phase = 'active';
    else if (rawStatus === 'past_due') state.phase = 'past_due';
    else if (rawStatus === 'expired') state.phase = 'expired';
    else state.phase = 'free';

    return state;
}

module.exports = {
    DAY_MS,
    FREE_TIER,
    TIER_ORDER,
    SELF_SERVE_TIERS,
    toDate,
    daysBetween,
    currentPeriodEnd,
    planRank,
    planDirection,
    hasEntitlement,
    isPendingChange,
    applyPendingChanges,
    describeState,
};
