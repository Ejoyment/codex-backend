/**
 * Subscription lifecycle tests.
 *
 * These lock in the behaviour the old billing tab got wrong: cancellation and
 * downgrades must not remove entitlements the user already paid for, trials
 * must cancel immediately, and the derived state must match the real status
 * values the model has always used ('trial', not 'trialing').
 */

const L = require('../utils/subscriptionLifecycle');
const Subscription = require('../models/Subscription');

const NOW = new Date('2026-03-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const sub = (overrides = {}) => new Subscription({ tier: 'developer', ...overrides });

describe('planDirection', () => {
    test('classifies upgrades, downgrades and no-ops by tier order', () => {
        expect(L.planDirection('developer', 'pro')).toBe('upgrade');
        expect(L.planDirection('pro', 'pro_plus')).toBe('upgrade');
        expect(L.planDirection('team_premium', 'developer')).toBe('downgrade');
        expect(L.planDirection('pro', 'pro')).toBe('current');
    });

    test('uses rank, not price, so seat plans are not mislabelled', () => {
        // Team Standard is $40/seat vs Pro $20 — more expensive, and still an
        // upgrade in capability terms.
        expect(L.planDirection('pro', 'team_standard')).toBe('upgrade');
        expect(L.planDirection('team_standard', 'pro')).toBe('downgrade');
    });

    test('normalizes legacy tier names', () => {
        expect(L.planDirection('freebie', 'pro')).toBe('upgrade');
        expect(L.planDirection('starter', 'pro')).toBe('upgrade');
    });
});

describe('currentPeriodEnd', () => {
    test('prefers endDate, then nextBillingDate, then trialEndsAt', () => {
        expect(L.currentPeriodEnd({ endDate: new Date('2026-04-01') })).toEqual(new Date('2026-04-01'));
        expect(L.currentPeriodEnd({ nextBillingDate: new Date('2026-04-05') })).toEqual(new Date('2026-04-05'));
        // trialEndsAt only counts while actually trialing.
        expect(L.currentPeriodEnd({ status: 'trial', trialEndsAt: new Date('2026-03-10') })).toEqual(
            new Date('2026-03-10')
        );
    });

    // A leftover trial date must not masquerade as a paid period: doing so made
    // a cancelled plan report a future end date and claim cancelling it was
    // not immediate.
    test('ignores a stale trialEndsAt on a non-trial document', () => {
        expect(L.currentPeriodEnd({ status: 'cancelled', trialEndsAt: new Date('2026-03-10') })).toBeNull();
        expect(L.currentPeriodEnd({ status: 'active', trialEndsAt: new Date('2026-03-10') })).toBeNull();
    });

    test('picks the latest when several are present', () => {
        const doc = {
            endDate: new Date('2026-04-01'),
            nextBillingDate: new Date('2026-05-01'),
        };
        expect(L.currentPeriodEnd(doc)).toEqual(new Date('2026-05-01'));
    });

    test('returns null for documents with no dates at all', () => {
        expect(L.currentPeriodEnd({})).toBeNull();
        expect(L.currentPeriodEnd(null)).toBeNull();
        expect(L.currentPeriodEnd({ endDate: 'not-a-date' })).toBeNull();
    });
});

describe('describeState', () => {
    test('reports a trialing user as phase=trial with days left', () => {
        const state = L.describeState(
            { tier: 'pro', status: 'trial', trialEndsAt: new Date(NOW.getTime() + 10 * DAY) },
            NOW
        );
        expect(state.phase).toBe('trial');
        expect(state.isTrialing).toBe(true);
        expect(state.trialDaysLeft).toBe(10);
        expect(state.hasEntitlement).toBe(true);
    });

    // This is the bug that made the old tab's trial banner dead code: it
    // compared against 'trialing', which has never been a valid status.
    test('never reports a live trial as free', () => {
        const state = L.describeState(
            { tier: 'pro', status: 'trial', trialEndsAt: new Date(NOW.getTime() + 3 * DAY) },
            NOW
        );
        expect(state.isFree).toBe(false);
        expect(state.canCancel).toBe(true);
    });

    test('a trial that already ended falls back to free', () => {
        const state = L.describeState(
            { tier: 'pro', status: 'trial', trialEndsAt: new Date(NOW.getTime() - DAY) },
            NOW
        );
        expect(state.isTrialing).toBe(false);
        expect(state.trialDaysLeft).toBe(0);
        expect(state.phase).not.toBe('trial');
    });

    test('a paid plan mid-period is not cancellable immediately', () => {
        const state = L.describeState(
            { tier: 'pro', status: 'active', endDate: new Date(NOW.getTime() + 20 * DAY) },
            NOW
        );
        expect(state.phase).toBe('active');
        expect(state.cancelIsImmediate).toBe(false);
        expect(state.canCancel).toBe(true);
        expect(state.periodDaysLeft).toBe(20);
    });

    // The old UI told users "you'll lose access at the end of the billing
    // period" while /cancel downgraded them to developer on the spot.
    test('a trial cancels immediately, a paid plan does not', () => {
        const trial = L.describeState(
            { tier: 'pro', status: 'trial', trialEndsAt: new Date(NOW.getTime() + 9 * DAY) },
            NOW
        );
        const paid = L.describeState(
            { tier: 'pro', status: 'active', endDate: new Date(NOW.getTime() + 9 * DAY) },
            NOW
        );
        expect(trial.cancelIsImmediate).toBe(true);
        expect(paid.cancelIsImmediate).toBe(false);
    });

    test('a plan with no period end on record cancels immediately', () => {
        const state = L.describeState({ tier: 'pro', status: 'active' }, NOW);
        expect(state.cancelIsImmediate).toBe(true);
    });

    test('pending cancellation exposes phase, effective date and resume', () => {
        const effective = new Date(NOW.getTime() + 15 * DAY);
        const state = L.describeState(
            {
                tier: 'pro',
                status: 'active',
                endDate: effective,
                cancelAtPeriodEnd: true,
                changeEffectiveAt: effective,
            },
            NOW
        );
        expect(state.phase).toBe('canceling');
        expect(state.hasPendingChange).toBe(true);
        expect(state.canResume).toBe(true);
        expect(state.cancelEffectiveAt).toEqual(effective);
        // Still entitled while the paid period runs out.
        expect(state.hasEntitlement).toBe(true);
    });

    test('pending downgrade names the target plan', () => {
        const effective = new Date(NOW.getTime() + 15 * DAY);
        const state = L.describeState(
            {
                tier: 'team_premium',
                status: 'active',
                endDate: effective,
                pendingTier: 'pro',
                changeEffectiveAt: effective,
            },
            NOW
        );
        expect(state.phase).toBe('changing');
        expect(state.pendingTier).toBe('pro');
        expect(state.canResume).toBe(true);
    });

    test('maps every status to a phase the UI can branch on', () => {
        const phaseOf = (over) => L.describeState({ tier: 'developer', ...over }, NOW).phase;
        expect(phaseOf({ status: 'active' })).toBe('free');
        expect(phaseOf({ status: 'past_due' })).toBe('past_due');
        expect(phaseOf({ status: 'expired' })).toBe('expired');
        expect(phaseOf({ tier: 'pro', status: 'active' })).toBe('active');
    });

    test('normalizes legacy tier names in the reported state', () => {
        expect(L.describeState({ tier: 'starter', status: 'active' }, NOW).tier).toBe('developer');
        expect(L.describeState({ tier: 'professional', status: 'active' }, NOW).tier).toBe('pro');
    });

    test('exposes enterprise-free self-serve tiers', () => {
        expect(L.describeState({ tier: 'pro', status: 'active' }, NOW).selfServeTiers).not.toContain('enterprise');
    });

    test('tolerates a null subscription', () => {
        const state = L.describeState(null, NOW);
        expect(state.isFree).toBe(true);
        expect(state.canCancel).toBe(false);
        expect(state.phase).toBe('free');
    });
});

describe('applyPendingChanges', () => {
    test('applies a due downgrade and clears the scheduling fields', () => {
        const doc = sub({
            tier: 'team_premium',
            status: 'active',
            pendingTier: 'pro',
            changeEffectiveAt: new Date(NOW.getTime() - DAY),
        });
        expect(L.applyPendingChanges(doc, NOW)).toBe(true);
        expect(doc.tier).toBe('pro');
        expect(doc.pendingTier).toBeUndefined();
        expect(doc.changeEffectiveAt).toBeUndefined();
        expect(doc.cancelAtPeriodEnd).toBe(false);
    });

    test('applies a due cancellation as a drop to free', () => {
        const doc = sub({
            tier: 'pro',
            status: 'active',
            cancelAtPeriodEnd: true,
            changeEffectiveAt: new Date(NOW.getTime() - DAY),
        });
        expect(L.applyPendingChanges(doc, NOW)).toBe(true);
        expect(doc.tier).toBe('developer');
        expect(doc.status).toBe('cancelled');
    });

    test('leaves a change alone until it is actually due', () => {
        const doc = sub({
            tier: 'team_premium',
            status: 'active',
            pendingTier: 'pro',
            changeEffectiveAt: new Date(NOW.getTime() + 5 * DAY),
        });
        expect(L.applyPendingChanges(doc, NOW)).toBe(false);
        expect(doc.tier).toBe('team_premium');
        expect(doc.pendingTier).toBe('pro');
    });

    test('is idempotent once applied', () => {
        const doc = sub({
            tier: 'pro',
            status: 'active',
            cancelAtPeriodEnd: true,
            changeEffectiveAt: new Date(NOW.getTime() - DAY),
        });
        expect(L.applyPendingChanges(doc, NOW)).toBe(true);
        expect(L.applyPendingChanges(doc, NOW)).toBe(false);
        expect(doc.tier).toBe('developer');
    });

    test('clears stale trial dates so no countdown outlives the trial', () => {
        const doc = sub({
            tier: 'pro',
            status: 'trial',
            trialEndsAt: new Date(NOW.getTime() - 2 * DAY),
            cancelAtPeriodEnd: true,
            changeEffectiveAt: new Date(NOW.getTime() - DAY),
        });
        L.applyPendingChanges(doc, NOW);
        expect(doc.trialEndsAt).toBeUndefined();
    });

    test('reactivates a cancelled plan when a replacement is scheduled', () => {
        const doc = sub({
            tier: 'pro',
            status: 'cancelled',
            pendingTier: 'pro_plus',
            changeEffectiveAt: new Date(NOW.getTime() - DAY),
        });
        L.applyPendingChanges(doc, NOW);
        expect(doc.tier).toBe('pro_plus');
        expect(doc.status).toBe('active');
    });

    test('does nothing without a scheduled date', () => {
        const doc = sub({ tier: 'pro', status: 'active' });
        expect(L.applyPendingChanges(doc, NOW)).toBe(false);
        expect(doc.tier).toBe('pro');
    });
});

describe('model integration', () => {
    // These fields were written by the routes but never declared on the schema,
    // so Mongoose strict mode silently dropped them and no paid plan had a
    // period end at all.
    test('persists the cancellation and period fields', () => {
        const doc = sub({
            tier: 'pro',
            status: 'active',
            cancelledAt: new Date(NOW),
            cancelAtPeriodEnd: true,
            pendingTier: 'pro_plus',
            changeEffectiveAt: new Date(NOW),
            startDate: new Date(NOW),
            endDate: new Date(NOW.getTime() + 30 * DAY),
        });
        const raw = doc.toObject();
        expect(raw.cancelledAt).toBeInstanceOf(Date);
        expect(raw.cancelAtPeriodEnd).toBe(true);
        expect(raw.pendingTier).toBe('pro_plus');
        expect(raw.changeEffectiveAt).toBeInstanceOf(Date);
        expect(raw.startDate).toBeInstanceOf(Date);
        expect(raw.endDate).toBeInstanceOf(Date);
    });

    test('rejects an unknown pendingTier on validation', () => {
        // Enums are enforced at validation/save time, not in the constructor.
        const doc = sub({ pendingTier: 'platinum' });
        const err = doc.validateSync();
        expect(err).toBeTruthy();
        expect(err.errors.pendingTier).toBeDefined();
    });
});
