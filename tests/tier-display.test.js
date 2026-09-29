/**
 * A free trial grants Pro, so the tier badge must name the tier the user is
 * actually on. Reporting "Free" during a Pro trial contradicts the entitlements
 * the backend enforces and the trial banner, which says the user is on Pro.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// buildrs-frontend/lib/tier.js is ESM and the root Jest config only transforms
// backend CommonJS, so evaluate the module here. It has no imports, so dropping
// the `export` keywords is enough to get at the real functions.
function loadTierModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'buildrs-frontend', 'lib', 'tier.js'), 'utf8');
  // Dropping `export` makes the declarations local, so re-export them by name to
  // emulate the module namespace.
  const names = [...source.matchAll(/^export\s+(?:const|function|let|var)\s+(\w+)/gm)].map((m) => m[1]);
  const context = vm.createContext({ module: { exports: {} }, Date, Math, Number, Boolean, String, Object, Array, console });
  vm.runInContext(`${source.replace(/^export\s+/gm, '')}\nmodule.exports = { ${names.join(', ')} };`, context);
  return context.module.exports;
}

const { normalizeTier, TIER_LABELS, isTrialing, trialDaysLeft, resolveTier, tierDisplayLabel, tierDisplayDetail } = loadTierModule();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

describe('tierDisplayLabel', () => {
  test('a paid subscription shows its own tier', () => {
    expect(tierDisplayLabel({ tier: 'pro', status: 'active' })).toBe('Pro');
    expect(tierDisplayLabel({ tier: 'pro_plus', status: 'active' })).toBe('Pro+');
    expect(tierDisplayLabel({ tier: 'enterprise', status: 'active' })).toBe('Enterprise');
  });

  test('a free subscription shows Free', () => {
    expect(tierDisplayLabel({ tier: 'developer', status: 'active' })).toBe('Free');
  });

  test('a trial shows the granted tier, not Free', () => {
    const label = tierDisplayLabel({ tier: 'pro', status: 'trial', trialEndsAt: inDays(12) });

    expect(label).toContain('Pro');
    expect(label).toContain('Trial');
    expect(label).not.toContain('Free');
  });

  test('a trial shows the remaining days', () => {
    expect(tierDisplayLabel({ tier: 'pro', status: 'trial', trialEndsAt: inDays(12) })).toBe('Pro (Trial · 12d)');
    expect(tierDisplayLabel({ tier: 'pro', status: 'trial', trialEndsAt: inDays(1) })).toBe('Pro (Trial · 1d)');
  });

  test('a lapsed trial still reads as a trial', () => {
    const label = tierDisplayLabel({ tier: 'pro', status: 'trial', trialEndsAt: inDays(-1) });

    expect(label).toBe('Pro (Trial)');
  });

  test('no subscription yet shows a placeholder, not Free', () => {
    expect(tierDisplayLabel(null)).toBe('—');
    expect(tierDisplayLabel(undefined)).toBe('—');
    expect(tierDisplayLabel({})).toBe('—');
  });

  test('the subscription wins over the fallback source', () => {
    expect(tierDisplayLabel({ tier: 'pro', status: 'active' }, 'developer')).toBe('Pro');
  });

  test('a missing tier on the subscription falls back', () => {
    expect(tierDisplayLabel({ status: 'active' }, 'pro')).toBe('Pro');
  });

  test('legacy tier names are normalized before display', () => {
    expect(tierDisplayLabel({ tier: 'professional', status: 'active' })).toBe('Pro');
    expect(tierDisplayLabel({ tier: 'freebie', status: 'active' })).toBe('Free');
  });
});

describe('tierDisplayDetail', () => {
  test('describes a trial in words', () => {
    expect(tierDisplayDetail({ tier: 'pro', status: 'trial', trialEndsAt: inDays(12) })).toBe('Pro plan — free trial, 12 days left');
    expect(tierDisplayDetail({ tier: 'pro', status: 'trial', trialEndsAt: inDays(1) })).toBe('Pro plan — free trial, 1 day left');
  });

  test('describes a settled subscription plainly', () => {
    expect(tierDisplayDetail({ tier: 'developer', status: 'active' })).toBe('Free plan');
    expect(tierDisplayDetail({ tier: 'pro', status: 'active' })).toBe('Pro plan');
  });

  test('flags a trial that is ending', () => {
    expect(tierDisplayDetail({ tier: 'pro', status: 'trial', trialEndsAt: inDays(-2) })).toBe('Pro plan — trial ending');
  });

  test('says it is loading when nothing is known', () => {
    expect(tierDisplayDetail(null)).toBe('Loading plan…');
  });
});

describe('isTrialing / trialDaysLeft', () => {
  test('only status trial counts as a trial', () => {
    expect(isTrialing({ status: 'trial' })).toBe(true);
    expect(isTrialing({ status: 'active' })).toBe(false);
    expect(isTrialing({ status: 'expired' })).toBe(false);
    expect(isTrialing(null)).toBe(false);
  });

  test('days left never goes negative', () => {
    expect(trialDaysLeft({ status: 'trial', trialEndsAt: inDays(5) })).toBe(5);
    expect(trialDaysLeft({ status: 'trial', trialEndsAt: inDays(-5) })).toBe(0);
    expect(trialDaysLeft({ status: 'active', trialEndsAt: inDays(5) })).toBe(0);
    expect(trialDaysLeft({ status: 'trial' })).toBe(0);
  });
});

describe('resolveTier', () => {
  test('returns null when nothing is loaded', () => {
    expect(resolveTier(null)).toBeNull();
    expect(resolveTier({})).toBeNull();
  });

  test('normalizes what it returns', () => {
    expect(resolveTier({ tier: 'starter' })).toBe('developer');
    expect(resolveTier({ tier: 'team' })).toBe('enterprise');
  });
});

describe('labels cover the six tiers', () => {
  test('every canonical tier has a label', () => {
    for (const tier of ['developer', 'pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise']) {
      expect(TIER_LABELS[tier]).toBeTruthy();
      expect(tierDisplayLabel({ tier, status: 'active' })).toBe(TIER_LABELS[tier]);
    }
  });

  test('normalizeTier still resolves the canonical set', () => {
    expect(normalizeTier('pro_plus')).toBe('pro_plus');
  });
});
