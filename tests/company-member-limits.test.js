const mongoose = require('mongoose');
const Company = require('../models/Company');
const {
    MAX_COMPANY_MEMBERS,
    cappedMemberLimit,
    resolveMemberLimit,
} = require('../utils/companyLimits');

function member(userId) {
    return { user: userId, role: 'member' };
}

describe('company member limits', () => {
    test('keeps tier limits and caps the fallback tier', () => {
        expect(resolveMemberLimit('developer')).toBe(1);
        expect(resolveMemberLimit('pro')).toBe(10);
        expect(resolveMemberLimit('pro_plus')).toBe(10);
        expect(resolveMemberLimit('team_standard')).toBe(MAX_COMPANY_MEMBERS);
        expect(resolveMemberLimit('enterprise', 5000)).toBe(MAX_COMPANY_MEMBERS);
    });

    test('preserves a purchased seat count on a team tier', () => {
        expect(resolveMemberLimit('team_premium', 25)).toBe(25);
        expect(resolveMemberLimit('enterprise', 40)).toBe(40);
    });

    test('treats missing, zero, or non-numeric limits as the ceiling', () => {
        expect(cappedMemberLimit(undefined)).toBe(MAX_COMPANY_MEMBERS);
        expect(cappedMemberLimit(0)).toBe(MAX_COMPANY_MEMBERS);
        expect(cappedMemberLimit('not-a-number')).toBe(MAX_COMPANY_MEMBERS);
        expect(cappedMemberLimit(25)).toBe(25);
        expect(cappedMemberLimit('25')).toBe(25);
    });

    test('the schema refuses a company above the structural ceiling', () => {
        const owner = new mongoose.Types.ObjectId();
        const atCeiling = Array.from({ length: MAX_COMPANY_MEMBERS }, () => member(new mongoose.Types.ObjectId()));
        const overCeiling = [...atCeiling, member(new mongoose.Types.ObjectId())];

        const valid = new Company({ name: 'Valid', slug: 'valid', owner, members: atCeiling });
        expect(valid.validateSync()).toBeUndefined();

        const invalid = new Company({ name: 'Too big', slug: 'too-big', owner, members: overCeiling });
        const error = invalid.validateSync();
        expect(error?.errors?.members?.message).toContain('cannot have more than');
    });
});
