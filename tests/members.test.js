/**
 * Member-reference normalization (dual-read until backfill converges).
 */
const { memberUserId, normalizeMembers, memberMatch } = require('../utils/members');

describe('memberUserId', () => {
  test('bare strings and ObjectIds', () => {
    expect(memberUserId('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    expect(memberUserId(null)).toBe(null);
    expect(memberUserId(undefined)).toBe(null);
  });

  test('subdocs beat their own _id (populated docs carry both)', () => {
    expect(memberUserId({ _id: 'subdoc-id', user: 'user-1' })).toBe('user-1');
    expect(memberUserId({ user: { _id: 'user-2' } })).toBe('user-2');
  });

  test('populated user docs resolve via _id', () => {
    expect(memberUserId({ _id: 'user-3', fullName: 'A' })).toBe('user-3');
  });
});

describe('normalizeMembers', () => {
  test('mixed shapes converge to [{ user }]', () => {
    expect(normalizeMembers(['a', { user: 'b' }, null, { _id: 'c' }])).toEqual([
      { user: 'a' },
      { user: 'b' },
      { user: 'c' },
    ]);
  });

  test('non-arrays become empty', () => {
    expect(normalizeMembers(null)).toEqual([]);
    expect(normalizeMembers(undefined)).toEqual([]);
  });
});

describe('memberMatch', () => {
  test('matches both storage shapes', () => {
    expect(memberMatch('u1')).toEqual({ $or: [{ members: 'u1' }, { 'members.user': 'u1' }] });
  });
});
