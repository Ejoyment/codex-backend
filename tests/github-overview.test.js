const {
  branchAgeDays,
  branchStatus,
  normalizeChecks,
  mapBranchSummary,
  mapPullRequestSummary,
} = require('../utils/githubOverview');

describe('GitHub overview helpers', () => {
  const now = new Date('2026-11-10T12:00:00.000Z').getTime();

  test('computes branch age in days', () => {
    expect(branchAgeDays('2026-11-01T12:00:00.000Z', now)).toBe(9);
    expect(branchAgeDays(null, now)).toBeNull();
    expect(branchAgeDays('not-a-date', now)).toBeNull();
  });

  test('marks protected branches before stale checks', () => {
    expect(branchStatus({ isProtected: true, lastCommitAt: '2025-01-01T00:00:00.000Z' }, now)).toBe('protected');
  });

  test('marks old branches stale and recent branches active', () => {
    expect(branchStatus({ lastCommitAt: '2026-09-01T00:00:00.000Z' }, now)).toBe('stale');
    expect(branchStatus({ lastCommitAt: '2026-11-09T00:00:00.000Z' }, now)).toBe('active');
  });

  test('maps branch summary fields', () => {
    const branch = {
      name: 'feature/login',
      protected: false,
      commit: { sha: 'abc123', url: 'https://github.com/acme/app/commit/abc123' },
    };

    const mapped = mapBranchSummary(branch, {
      defaultBranch: 'main',
      compare: { ahead_by: 3, behind_by: 1 },
      commit: {
        sha: 'abc123',
        html_url: 'https://github.com/acme/app/commit/abc123',
        commit: {
          message: 'Add login flow\n\nMore detail',
          author: { name: 'Ada Lovelace', date: '2026-11-09T00:00:00.000Z' },
        },
        author: { login: 'ada', avatar_url: 'https://avatars.example/ada.png' },
      },
      now,
    });

    expect(mapped).toMatchObject({
      name: 'feature/login',
      protected: false,
      defaultBranch: false,
      ahead: 3,
      behind: 1,
      status: 'active',
      lastCommit: {
        sha: 'abc123',
        message: 'Add login flow',
        authorName: 'Ada Lovelace',
        authorLogin: 'ada',
        authorAvatar: 'https://avatars.example/ada.png',
      },
    });
  });

  test('normalizes combined commit statuses', () => {
    expect(normalizeChecks(null)).toEqual({ state: 'none', total: 0, passing: 0, failing: 0, pending: 0, url: '' });
    expect(normalizeChecks({
      state: 'failure',
      total_count: 3,
      target_url: 'https://ci.example/run/1',
      statuses: [
        { state: 'success' },
        { state: 'failure' },
        { state: 'pending' },
      ],
    })).toEqual({
      state: 'failure',
      total: 3,
      passing: 1,
      failing: 1,
      pending: 1,
      url: 'https://ci.example/run/1',
    });
  });

  test('maps pull request summary and merged state', () => {
    const mapped = mapPullRequestSummary({
      id: 7,
      number: 204,
      title: 'Add deterministic checkout',
      body: 'Body',
      state: 'closed',
      merged_at: '2026-11-09T10:00:00.000Z',
      closed_at: '2026-11-09T10:00:00.000Z',
      draft: false,
      user: { login: 'ada', avatar_url: 'https://avatars.example/ada.png' },
      head: { ref: 'feature/checkout', sha: 'head123' },
      base: { ref: 'main', sha: 'base123' },
      labels: [{ name: 'backend', color: '12dce5', description: 'Server changes' }],
      additions: 120,
      deletions: 30,
      changed_files: 4,
      commits: 2,
      created_at: '2026-11-08T10:00:00.000Z',
      updated_at: '2026-11-09T10:00:00.000Z',
      html_url: 'https://github.com/acme/app/pull/204',
      mergeable: true,
    }, { state: 'success', total_count: 1, statuses: [{ state: 'success' }] });

    expect(mapped).toMatchObject({
      number: 204,
      state: 'merged',
      user: 'ada',
      head: 'feature/checkout',
      base: 'main',
      headSha: 'head123',
      baseSha: 'base123',
      additions: 120,
      deletions: 30,
      changedFiles: 4,
      commitCount: 2,
      checks: { state: 'success', total: 1, passing: 1, failing: 0, pending: 0 },
    });
    expect(mapped.labels).toEqual([{ name: 'backend', color: '12dce5', description: 'Server changes' }]);
  });
});
