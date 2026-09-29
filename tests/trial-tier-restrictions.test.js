/**
 * Trial state and tier restrictions.
 *
 * A free trial grants Pro, so a subscription recorded as developer+trial is
 * wrong twice over: the UI reports "Free" while the trial is live, and the
 * restrictions applied are the free ones. These tests cover the repair and the
 * re-sync of a tier's restriction profile.
 */

const Subscription = require('../models/Subscription');
const { createTrialSubscription, repairTrialTier, downgradeExpiredTrial, TRIAL_TIER } = require('../middleware/trial');

const USER = '507f1f77bcf86cd799439011';
const DAY = 24 * 60 * 60 * 1000;

describe('createTrialSubscription', () => {
  test('a new trial is on the tier it grants, not developer', () => {
    const sub = createTrialSubscription(USER);

    expect(sub.tier).toBe('pro');
    expect(sub.tier).toBe(TRIAL_TIER);
    expect(sub.status).toBe('trial');
  });

  test('a new trial carries the pro restrictions', () => {
    const sub = createTrialSubscription(USER);

    expect(sub.specEngineLevel).toBe('full_sdd');
    expect(sub.creditPool.monthlyLimit).toBe(20);
    expect(sub.maxConcurrentAgentJobs).toBe(1);
    expect(sub.webrtcVoiceEnabled).toBe(true);
  });

  test('a new trial lasts 14 days and is priced at zero', () => {
    const startedAt = new Date('2026-09-29T12:00:00.000Z');
    const sub = createTrialSubscription(USER, startedAt);

    expect(sub.trialEndsAt.getTime() - startedAt.getTime()).toBe(14 * DAY);
    expect(sub.pricing.amount).toBe(0);
    expect(sub.pricing.interval).toBe('trial');
  });
});

describe('repairTrialTier', () => {
  test('a live trial recorded as developer is restored to the granted tier', () => {
    const sub = new Subscription({
      userId: USER,
      tier: 'developer',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 5 * DAY),
    });

    expect(repairTrialTier(sub)).toBe(true);
    expect(sub.tier).toBe('pro');
    expect(sub.status).toBe('trial');
  });

  test('restoring the trial tier also restores its restrictions', () => {
    const sub = new Subscription({
      userId: USER,
      tier: 'developer',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 5 * DAY),
    });
    sub.syncTierRestrictions('developer');
    expect(sub.specEngineLevel).toBe('read_only');

    repairTrialTier(sub);

    expect(sub.specEngineLevel).toBe('full_sdd');
    expect(sub.creditPool.monthlyLimit).toBe(20);
  });

  test('an elapsed trial is expired rather than promoted', () => {
    const sub = new Subscription({
      userId: USER,
      tier: 'developer',
      status: 'trial',
      trialEndsAt: new Date(Date.now() - DAY),
    });

    expect(repairTrialTier(sub)).toBe(true);
    expect(sub.status).toBe('expired');
    expect(sub.tier).toBe('developer');
  });

  test('a healthy trial is left alone', () => {
    const sub = createTrialSubscription(USER);

    expect(repairTrialTier(sub)).toBe(false);
    expect(sub.tier).toBe('pro');
  });

  test('a non-trial subscription is left alone', () => {
    const free = new Subscription({ userId: USER, tier: 'developer', status: 'active' });
    const paid = new Subscription({ userId: USER, tier: 'pro', status: 'active' });

    expect(repairTrialTier(free)).toBe(false);
    expect(repairTrialTier(paid)).toBe(false);
  });

  test('a trial with no end date is not treated as expired', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer', status: 'trial' });

    expect(repairTrialTier(sub)).toBe(true);
    expect(sub.tier).toBe('pro');
    expect(sub.status).toBe('trial');
  });
});

describe('downgradeExpiredTrial', () => {
  test('an elapsed trial downgrades to developer with free restrictions', () => {
    const sub = createTrialSubscription(USER, new Date(Date.now() - 20 * DAY));

    expect(downgradeExpiredTrial(sub)).toBe(true);
    expect(sub.tier).toBe('developer');
    expect(sub.status).toBe('expired');
    expect(sub.specEngineLevel).toBe('read_only');
    expect(sub.creditPool.monthlyLimit).toBe(0);
  });

  test('a live trial is not downgraded', () => {
    const sub = createTrialSubscription(USER);

    expect(downgradeExpiredTrial(sub)).toBe(false);
    expect(sub.tier).toBe('pro');
  });
});

describe('syncTierRestrictions', () => {
  test('re-applies the profile of the tier it is given', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer' });

    sub.syncTierRestrictions('pro_plus');

    expect(sub.creditPool.monthlyLimit).toBe(70);
    expect(sub.cloudComputeHours.monthlyLimit).toBe(50);
    expect(sub.maxConcurrentAgentJobs).toBe(3);
    expect(sub.taskTimeoutMinutes).toBe(30);
    expect(sub.specEngineLevel).toBe('realtime_drift');
    expect(sub.dataRetentionDays).toBe(30);
    // Team library / RBAC start at team_standard, not at pro.
    expect(sub.teamSpecLibrary).toBe(false);
    expect(sub.teamRBAC).toBe(false);
  });

  test('team_standard turns on the team flags', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer' });

    sub.syncTierRestrictions('team_standard');

    expect(sub.teamSpecLibrary).toBe(true);
    expect(sub.teamRBAC).toBe(true);
  });

  test('defaults to the subscription own tier', () => {
    const sub = new Subscription({ userId: USER, tier: 'team_standard' });

    sub.syncTierRestrictions();

    expect(sub.specEngineLevel).toBe('team_library');
    expect(sub.maxActiveDeployments).toBe(20);
  });

  test('preserves usage counters', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer' });
    sub.creditPool.usedThisMonth = 7;
    sub.cloudComputeHours.usedThisMonth = 3;

    sub.syncTierRestrictions('pro');

    expect(sub.creditPool.usedThisMonth).toBe(7);
    expect(sub.cloudComputeHours.usedThisMonth).toBe(3);
    expect(sub.creditPool.monthlyLimit).toBe(20);
  });

  test('does not touch pricing', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer', pricing: { amount: 19, currency: 'USD', interval: 'monthly' } });

    sub.syncTierRestrictions('enterprise');

    expect(sub.pricing.amount).toBe(19);
    expect(sub.pricing.interval).toBe('monthly');
  });

  test('an unknown tier is a no-op', () => {
    const sub = new Subscription({ userId: USER, tier: 'developer' });
    sub.specEngineLevel = 'team_library';

    expect(sub.syncTierRestrictions('nonsense')).toBe(false);
    expect(sub.specEngineLevel).toBe('team_library');
  });

  test('every canonical tier has a profile that round-trips', () => {
    for (const tier of ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise']) {
      const sub = new Subscription({ userId: USER, tier: 'developer' });
      expect(sub.syncTierRestrictions(tier)).toBe(true);
      expect(sub.specEngineLevel).toBe(Subscription.tierConfigs[tier].specEngineLevel);
    }
  });
});

describe('tierConfigs are reachable', () => {
  test('Model.tierConfigs exposes every tier', () => {
    // Statics assigned after mongoose.model() are not copied onto the model, so
    // this used to be silently undefined and made every sync a no-op.
    expect(Subscription.tierConfigs).toBeDefined();
    for (const tier of ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise']) {
      expect(Subscription.tierConfigs[tier]).toBeDefined();
    }
  });
});
