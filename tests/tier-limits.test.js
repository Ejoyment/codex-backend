/**
 * Rec 12 — single tier-limit table (utils/tierLimits.js).
 *
 * Locks the collapse of the three divergent tables (Subscription getters,
 * canUseFeature inline table, enforcement inline checks) into one source of
 * truth with one convention (null = unlimited). No database needed.
 */
const { TIER_LIMITS, limitFor, limitAllows, remainingFor } = require('../utils/tierLimits');
const Subscription = require('../models/Subscription');

const sub = (tier) => new Subscription({ tier });

describe('TIER_LIMITS table', () => {
  test('pro values match the legacy getters', () => {
    expect(TIER_LIMITS.pro).toEqual({
      monthlyCredits: 20,
      cloudComputeHours: 10,
      maxConcurrentAgentJobs: 1,
      taskTimeoutMinutes: 15,
      maxDebugHostRooms: 1,
      maxDebugParticipants: 2,
      maxActiveDeployments: 3,
    });
  });

  test('enterprise is unlimited (null) everywhere', () => {
    for (const value of Object.values(TIER_LIMITS.enterprise)) {
      expect(value).toBe(null);
    }
  });

  test('team unlimiteds use null, not Infinity', () => {
    expect(TIER_LIMITS.team_standard.maxDebugHostRooms).toBe(null);
    expect(TIER_LIMITS.team_premium.maxDebugHostRooms).toBe(null);
    expect(TIER_LIMITS.team_premium.maxActiveDeployments).toBe(null);
  });
});

describe('Subscription getters delegate to the table', () => {
  test('pro tier', () => {
    const s = sub('pro');
    expect(s.getMonthlyCreditLimit()).toBe(20);
    expect(s.getCloudComputeHours()).toBe(10);
    expect(s.getMaxConcurrentAgentJobs()).toBe(1);
    expect(s.getTaskTimeoutMinutes()).toBe(15);
    expect(s.getMaxDebugHostRooms()).toBe(1);
    expect(s.getMaxDebugParticipants()).toBe(2);
    expect(s.getMaxActiveDeployments()).toBe(3);
  });

  test('team unlimiteds read as null', () => {
    const s = sub('team_standard');
    expect(s.getMaxDebugHostRooms()).toBe(null);
    expect(s.getMaxActiveDeployments()).toBe(20);
  });

  test('unknown tier keeps the legacy fail-closed fallbacks', () => {
    const s = sub('nonexistent');
    expect(s.getMonthlyCreditLimit()).toBe(null);
    expect(s.getMaxDebugHostRooms()).toBe(0);
    expect(s.getMaxDebugParticipants()).toBe(0);
    expect(s.getMaxActiveDeployments()).toBe(1);
  });

  test('canUseFeature maps onto the same table', () => {
    expect(sub('pro').canUseFeature('concurrentAgentJobs')).toBe(1);
    expect(sub('developer').canUseFeature('concurrentAgentJobs')).toBe(false);
    expect(sub('enterprise').canUseFeature('activeDeployments')).toBe(true);
    expect(sub('pro').canUseFeature('nope')).toBe(false);
    expect(sub('nonexistent').canUseFeature('monthlyCredits')).toBe(false);
  });
});

describe('comparison helpers', () => {
  test('limitAllows: null always allows, else strict less-than', () => {
    expect(limitAllows(null, 9999)).toBe(true);
    expect(limitAllows(3, 2)).toBe(true);
    expect(limitAllows(3, 3)).toBe(false);
    expect(limitAllows(0, 0)).toBe(false);
  });

  test('remainingFor: null becomes Infinity', () => {
    expect(remainingFor(null, 5)).toBe(Infinity);
    expect(remainingFor(20, 7)).toBe(13);
  });

  test('limitFor returns null for unknown tier/key', () => {
    expect(limitFor('nope', 'monthlyCredits')).toBe(null);
    expect(limitFor('pro', 'nope')).toBe(null);
  });
});
