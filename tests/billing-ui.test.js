/**
 * Billing copy + plan impact tests.
 *
 * The billing tab makes promises to users about their money. These tests
 * verify the promises are derived from the real limits (lib/tier.js) and the
 * real API state, so the copy cannot drift from behaviour — which is exactly
 * how the old tab ended up promising "you'll lose access at the end of the
 * billing period" while the API revoked access immediately.
 */

const fs = require('fs');
const path = require('path');

const { loadEsmModule } = require('./helpers/loadFrontendModule');

const FRONTEND = path.resolve(__dirname, '../buildrs-frontend');
const TIER_PATH = path.resolve(FRONTEND, 'lib/tier.js');
const PLANS_PATH = path.resolve(FRONTEND, 'lib/plans.js');
const COPY_PATH = path.resolve(FRONTEND, 'lib/billingCopy.js');
const SETTINGS_PATH = path.resolve(FRONTEND, 'pages/settings.js');
const CHECKOUT_PATH = path.resolve(FRONTEND, 'pages/checkout.js');

const read = (p) => fs.readFileSync(p, 'utf8');

let tier;
let plans;
let copy;

beforeAll(() => {
    tier = loadEsmModule(TIER_PATH, { './tier': {} });
    plans = loadEsmModule(PLANS_PATH, {});
    copy = loadEsmModule(COPY_PATH, { './tier': tier, './plans': plans });
});

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY);

const state = (over = {}) => ({
    tier: 'developer',
    status: 'active',
    isTrialing: false,
    isPaid: false,
    isFree: true,
    trialDaysLeft: 0,
    periodDaysLeft: 0,
    cancelIsImmediate: true,
    canCancel: false,
    canResume: false,
    canChangePlan: true,
    hasPendingChange: false,
    cancelAtPeriodEnd: false,
    pendingTier: null,
    changeEffectiveAt: null,
    trialEndsAt: null,
    endDate: null,
    nextBillingDate: null,
    paymentProvider: null,
    ...over,
});

describe('plan catalog', () => {
    test('covers every canonical backend tier exactly once', () => {
        const ids = plans.ALL_PLANS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'].forEach((tier) =>
            expect(ids).toContain(tier)
        );
    });

    test('priced plans have both monthly and yearly amounts', () => {
        plans.PLANS.filter((p) => !p.contactSales).forEach((plan) => {
            expect(typeof plan.monthlyPrice).toBe('number');
            expect(typeof plan.yearlyPrice).toBe('number');
            expect(plan.yearlyPrice).toBeLessThan(plan.monthlyPrice * 12);
        });
    });

    test('enterprise is quoted, not self-serve', () => {
        const enterprise = plans.planById('enterprise');
        expect(enterprise.contactSales).toBe(true);
        expect(enterprise.monthlyPrice).toBeNull();
        expect(plans.planPrice('enterprise')).toBeNull();
    });

    test('free plan is zero cost', () => {
        expect(plans.FREE_PLAN.monthlyPrice).toBe(0);
        expect(plans.planPrice('developer')).toBe(0);
    });

    test('yearly discount is reported as a real percentage', () => {
        // Pro: $20/mo = $240/yr vs $192/yr => 20% off
        expect(plans.yearlySavingsPercent('pro')).toBe(20);
    });

    test('planDirection mirrors the backend ordering', () => {
        expect(plans.planDirection('developer', 'pro')).toBe('upgrade');
        expect(plans.planDirection('team_premium', 'pro')).toBe('downgrade');
        expect(plans.planDirection('pro', 'pro')).toBe('current');
    });
});

describe('planImpact', () => {
    test('moving Pro to Free lists exactly what is lost', () => {
        const { direction, losses } = copy.planImpact('pro', 'developer');
        expect(direction).toBe('downgrade');
        const labels = losses.map((l) => l.label);
        expect(labels).toContain('Projects');
        expect(labels).toContain('Team members');
        expect(labels).toContain('Storage');
        expect(labels).toContain('AI pair programming');
        expect(labels).toContain('Team chat');
    });

    test('reports limits as readable values, not raw codes', () => {
        const { losses } = copy.planImpact('pro', 'developer');
        const storage = losses.find((l) => l.label === 'Storage');
        expect(storage.from).toBe('5 GB');
        expect(storage.to).toBe('50 MB');

        const projects = losses.find((l) => l.label === 'Projects');
        expect(projects.from).toBe('50');
        expect(projects.to).toBe('1');
    });

    // `-1` means unlimited, which is the best value. Comparing it as a number
    // made Team Premium -> Pro read as a gain for the member limit.
    test('renders -1 as Unlimited and treats it as a loss when reduced', () => {
        const { losses, gains } = copy.planImpact('team_premium', 'pro');
        const members = losses.find((l) => l.label === 'Team members');
        expect(members.from).toBe('Unlimited');
        expect(members.to).toBe('10');
        expect(gains.find((l) => l.label === 'Team members')).toBeUndefined();
    });

    test('an upgrade lists gains and no losses', () => {
        const { direction, gains, losses } = copy.planImpact('developer', 'pro');
        expect(direction).toBe('upgrade');
        expect(gains.length).toBeGreaterThan(0);
        expect(losses).toHaveLength(0);
    });

    test('a no-op change has neither gains nor losses', () => {
        const { gains, losses } = copy.planImpact('pro', 'pro');
        expect(gains).toHaveLength(0);
        expect(losses).toHaveLength(0);
    });

    test('handles legacy tier names', () => {
        const { direction } = copy.planImpact('starter', 'pro');
        expect(direction).toBe('upgrade');
    });
});

describe('cancelCopy', () => {
    // The regression this file exists for.
    test('a paid mid-period plan keeps access until the period ends', () => {
        const end = inDays(20);
        const result = copy.cancelCopy(
            state({ tier: 'pro', status: 'active', isPaid: true, isFree: false, cancelIsImmediate: false, endDate: end })
        );
        expect(result.immediate).toBe(false);
        expect(result.body).toMatch(/keep/i);
        expect(result.body).not.toMatch(/immediately/i);
        expect(result.confirmLabel).toMatch(/period end/i);
        expect(result.effectiveLine).toMatch(/on /i);
    });

    test('a trial ends immediately and says so', () => {
        const result = copy.cancelCopy(
            state({
                tier: 'pro',
                status: 'trial',
                isTrialing: true,
                isPaid: true,
                isFree: false,
                cancelIsImmediate: true,
                trialEndsAt: inDays(6),
            })
        );
        expect(result.immediate).toBe(true);
        expect(result.confirmLabel).toMatch(/end trial/i);
        expect(result.effectiveLine).toMatch(/immediately/i);
    });

    test('a free plan reports an immediate move to free', () => {
        const result = copy.cancelCopy(state({ tier: 'developer', isFree: true, cancelIsImmediate: true }));
        expect(result.immediate).toBe(true);
        expect(result.effectiveLine).toMatch(/immediately/i);
    });

    test('always offers a way out of the destructive path', () => {
        ['immediate', 'deferred'].forEach((kind) => {
            const base = { tier: 'pro', isPaid: true, isFree: false };
            const s = kind === 'immediate' ? state({ ...base, cancelIsImmediate: true }) : state({ ...base, cancelIsImmediate: false, endDate: inDays(10) });
            expect(copy.cancelCopy(s).confirmLabel).toBeTruthy();
            expect(copy.cancelCopy(s).title).toBeTruthy();
        });
    });
});

describe('downgradeCopy', () => {
    test('names the losses and the date the switch happens', () => {
        const result = copy.downgradeCopy(
            state({ tier: 'pro', status: 'active', isPaid: true, isFree: false, cancelIsImmediate: false, endDate: inDays(20) }),
            'developer'
        );
        expect(result.title).toMatch(/Free/i);
        expect(result.losses.length).toBeGreaterThan(0);
        expect(result.effectiveLine).toMatch(/on /i);
        expect(result.body).toMatch(/keep your current limits/i);
    });

    test('a trial downgrade applies right away', () => {
        const result = copy.downgradeCopy(
            state({ tier: 'pro', isTrialing: true, isPaid: true, isFree: false, cancelIsImmediate: true, trialEndsAt: inDays(4) }),
            'developer'
        );
        expect(result.effectiveLine).toMatch(/immediately/i);
    });
});

describe('upgradeCopy', () => {
    test('states the price and interval for the new plan', () => {
        const result = copy.upgradeCopy(state({ tier: 'pro', isPaid: true, isFree: false }), 'pro_plus', 'yearly');
        expect(result.title).toMatch(/Pro\+/);
        expect(result.price).toBe(576);
        expect(result.body).toMatch(/\$576/);
    });

    test('uses monthly pricing when asked', () => {
        const result = copy.upgradeCopy(state({ tier: 'developer' }), 'pro', 'monthly');
        expect(result.price).toBe(20);
    });
});

describe('statusMeta and renewalCopy', () => {
    test('names the trial and counts down', () => {
        const meta = copy.statusMeta(state({ phase: 'trial', isTrialing: true, trialDaysLeft: 5 }));
        expect(meta.tone).toBe('trial');
        expect(meta.label).toMatch(/5 days/);
    });

    test('singularises a one-day trial', () => {
        expect(copy.statusMeta(state({ phase: 'trial', isTrialing: true, trialDaysLeft: 1 })).label).toMatch(/1 day(?!s)/);
    });

    test('a pending cancellation is surfaced as a warning, not a success', () => {
        const meta = copy.statusMeta(state({ phase: 'canceling', cancelAtPeriodEnd: true }));
        expect(meta.tone).toBe('warning');
        expect(meta.label).toMatch(/period end/i);
    });

    test('a scheduled downgrade names the target plan', () => {
        const meta = copy.statusMeta(state({ phase: 'changing', pendingTier: 'pro' }));
        expect(meta.label).toMatch(/Pro/);
    });

    test('failed payments are a danger state', () => {
        expect(copy.statusMeta(state({ phase: 'past_due' })).tone).toBe('danger');
    });

    test('renewal copy tells a trialing user what happens at the end', () => {
        const text = copy.renewalCopy(state({ phase: 'trial', isTrialing: true, trialEndsAt: inDays(3) }));
        expect(text).toMatch(/Free/i);
        expect(text).toMatch(/unless you upgrade/i);
    });

    test('renewal copy reassures a user whose cancel is pending', () => {
        const text = copy.renewalCopy(
            state({ tier: 'pro', phase: 'canceling', cancelAtPeriodEnd: true, changeEffectiveAt: inDays(12), endDate: inDays(12) })
        );
        expect(text).toMatch(/keep/i);
    });

    test('renewal copy covers every phase without throwing', () => {
        ['trial', 'active', 'canceling', 'changing', 'past_due', 'expired', 'free'].forEach((phase) => {
            expect(copy.renewalCopy(state({ phase }))).toBeTruthy();
        });
    });
});

describe('trialProgress', () => {
    test('is 0 at the start of a trial and 1 at the end', () => {
        expect(copy.trialProgress(state({ isTrialing: true, trialDaysLeft: 14 }), 14)).toBe(0);
        expect(copy.trialProgress(state({ isTrialing: true, trialDaysLeft: 0 }), 14)).toBe(1);
    });

    test('is proportional mid-trial and clamped to 0..1', () => {
        expect(copy.trialProgress(state({ isTrialing: true, trialDaysLeft: 7 }), 14)).toBeCloseTo(0.5);
        // More days left than the trial length means it has not started yet.
        expect(copy.trialProgress(state({ isTrialing: true, trialDaysLeft: 99 }), 14)).toBe(0);
        // An overshoot means the trial is over.
        expect(copy.trialProgress(state({ isTrialing: true, trialDaysLeft: -5 }), 14)).toBe(1);
    });

    test('is 0 when not trialing', () => {
        expect(copy.trialProgress(state({ isTrialing: false }))).toBe(0);
    });
});

describe('settings billing tab wiring', () => {
    const source = read(SETTINGS_PATH);

    test('renders the API-derived state rather than re-deriving it', () => {
        expect(source).toMatch(/data\.state/);
        expect(source).toMatch(/setState\(data\.state/);
    });

    // The two dead conditions that made the old tab render no trial UI at all.
    test('does not use the invalid "trialing" status', () => {
        expect(source).not.toMatch(/'trialing'/);
        expect(source).not.toMatch(/===\s*'trialing'/);
    });

    test('does not read the non-existent trialEnd field', () => {
        expect(source).not.toMatch(/subscription\?\.trialEnd\b/);
        expect(source).not.toMatch(/subscription\.trialEnd\b/);
    });

    // The account-deletion confirm is a different flow and is out of scope here;
    // assert on the billing section only.
    test('no longer uses window.confirm for cancellation', () => {
        const billing = source.slice(source.indexOf('function BillingConfirmDialog'), source.indexOf('export default function Settings'));
        expect(billing).not.toMatch(/window\.confirm/);
        expect(billing).toMatch(/role="alertdialog"/);
    });

    test('offers upgrade, cancel and downgrade paths', () => {
        expect(source).toMatch(/Upgrade now/);
        expect(source).toMatch(/Change plan/);
        expect(source).toMatch(/End trial/);
        expect(source).toMatch(/Move to the Free plan/);
    });

    test('states the trial countdown to the user', () => {
        expect(source).toMatch(/trialDaysLeft/);
        expect(source).toMatch(/bill-trial-fill/);
    });

    test('uses the shared plan catalog rather than a local copy', () => {
        expect(source).toMatch(/from '\.\.\/lib\/plans'/);
        expect(source).not.toMatch(/const PLANS = \[/);
    });
});

describe('checkout deep links', () => {
    const source = read(CHECKOUT_PATH);

    test('no longer duplicates the plan catalog', () => {
        expect(source).toMatch(/from '\.\.\/lib\/plans'/);
        expect(source).not.toMatch(/const PLANS = \[/);
    });

    test('accepts a plan and interval from the query string', () => {
        expect(source).toMatch(/router\.query/);
        expect(source).toMatch(/setSelectedPlan/);
        expect(source).toMatch(/setYearly/);
    });

    test('ignores an unknown plan instead of selecting nothing', () => {
        expect(source).toMatch(/PLANS\.some/);
    });
});

describe('api client', () => {
    const source = read(path.resolve(FRONTEND, 'lib/api.js'));

    test('exposes cancel, resume and changePlan', () => {
        expect(source).toMatch(/subscriptionApi/);
        expect(source).toMatch(/cancel:/);
        expect(source).toMatch(/resume:/);
        expect(source).toMatch(/changePlan:/);
    });

    test('cancel sends no mode by default so the API can decide', () => {
        expect(source).toMatch(/mode \? \{ mode \} : \{\}/);
    });
});
