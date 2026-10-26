/**
 * E9 — company role migration and owner bulk promotion.
 *
 * Legacy rows predate explicit roles. Reads already fail closed to viewer, but
 * leaving the data unset makes every future read depend on that fallback.
 * Backfill is idempotent, defaults to dry-run, and never promotes implicitly:
 * missing roles become viewer; an owner can then promote specific members.
 */
const Company = require('../../models/Company');

const COMPANY_ROLES = Object.freeze(['owner', 'admin', 'member', 'viewer']);
const PROMOTABLE_ROLES = Object.freeze(['admin', 'member', 'viewer']);
const ROLE_RANK = Object.freeze({ viewer: 0, member: 1, admin: 2, owner: 3 });

function roleOf(member) {
  return COMPANY_ROLES.includes(member?.role) ? member.role : 'viewer';
}

function userIdOf(member) {
  const value = member?.user;
  if (!value) return null;
  return String(value._id || value);
}

function missingRoleMembers(company) {
  return (company?.members || []).filter((member) => !COMPANY_ROLES.includes(member?.role));
}

async function scanMissingRoles() {
  const companies = await Company.find({
    $or: [
      { 'members.role': { $exists: false } },
      { 'members.role': { $nin: COMPANY_ROLES } },
    ],
  });

  return companies
    .map((company) => {
      const missing = missingRoleMembers(company);
      if (missing.length === 0) return null;
      return {
        companyId: String(company._id),
        name: company.name,
        missingMembers: missing.map((member) => userIdOf(member)).filter(Boolean),
      };
    })
    .filter(Boolean);
}

async function backfillMissingRoles({ dryRun = true } = {}) {
  const findings = await scanMissingRoles();
  const result = {
    dryRun: Boolean(dryRun),
    companiesAffected: findings.length,
    affectedMembers: findings.reduce((sum, row) => sum + row.missingMembers.length, 0),
    companies: findings,
    updatedCompanies: 0,
  };
  if (dryRun || findings.length === 0) return result;

  for (const finding of findings) {
    const company = await Company.findById(finding.companyId);
    if (!company) continue;
    let changed = false;
    for (const member of missingRoleMembers(company)) {
      member.role = 'viewer';
      changed = true;
    }
    if (changed) {
      await company.save();
      result.updatedCompanies += 1;
    }
  }
  return result;
}

async function bulkPromoteMembers({
  companyId,
  userIds,
  role = 'member',
  actorId,
  dryRun = true,
} = {}) {
  if (!PROMOTABLE_ROLES.includes(role)) {
    const error = new Error('role must be one of: admin, member, viewer');
    error.statusCode = 400;
    throw error;
  }
  const requested = Array.isArray(userIds) ? userIds.map(String) : [];
  if (requested.length === 0) {
    const error = new Error('userIds must be a non-empty array');
    error.statusCode = 400;
    throw error;
  }

  const company = await Company.findById(companyId);
  if (!company) {
    const error = new Error('Company not found');
    error.statusCode = 404;
    throw error;
  }
  if (actorId && String(company.owner) !== String(actorId)) {
    const error = new Error('Only the company owner can bulk-promote members');
    error.statusCode = 403;
    throw error;
  }

  const byUser = new Map(
    (company.members || [])
      .map((member) => [userIdOf(member), member])
      .filter(([userId]) => userId)
  );
  const changes = [];
  const unchanged = [];

  for (const userId of requested) {
    const member = byUser.get(userId);
    if (!member) {
      unchanged.push({ userId, reason: 'not a member' });
      continue;
    }
    if (String(member.user?._id || member.user) === String(company.owner)) {
      unchanged.push({ userId, reason: 'owner cannot be changed' });
      continue;
    }
    const from = roleOf(member);
    if (ROLE_RANK[role] <= ROLE_RANK[from]) {
      unchanged.push({ userId, from, reason: 'not an upward promotion' });
      continue;
    }
    changes.push({ userId, from, to: role, member });
  }

  const result = {
    dryRun: Boolean(dryRun),
    companyId: String(company._id),
    role,
    requested: requested.length,
    changes: changes.map(({ userId, from, to }) => ({ userId, from, to })),
    unchanged,
    updated: 0,
  };
  if (dryRun || changes.length === 0) return result;

  for (const change of changes) {
    change.member.role = role;
  }
  await company.save();
  result.updated = changes.length;
  return result;
}

module.exports = {
  COMPANY_ROLES,
  PROMOTABLE_ROLES,
  scanMissingRoles,
  backfillMissingRoles,
  bulkPromoteMembers,
};
