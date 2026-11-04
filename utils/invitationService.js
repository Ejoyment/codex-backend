const Invitation = require('../models/Invitation');
const Company = require('../models/Company');
const User = require('../models/User');

function isSameId(left, right) {
  return String(left || '') === String(right || '');
}

async function ensureCompanyMembership(invitation, userId) {
  const member = { user: userId, role: invitation.role };
  const company = await Company.findOneAndUpdate(
    { _id: invitation.company, 'members.user': { $ne: userId } },
    { $addToSet: { members: member } },
    { new: true }
  );
  if (company) return { company, alreadyMember: false };

  const existingCompany = await Company.findById(invitation.company);
  if (!existingCompany) return { company: null, alreadyMember: false };
  const alreadyMember = existingCompany.members.some((item) => isSameId(item.user, userId));
  return { company: existingCompany, alreadyMember };
}

async function acceptInvitation(token, userId) {
  const [invitation, user] = await Promise.all([
    Invitation.findOne({ token }),
    User.findById(userId),
  ]);
  if (!invitation) return { success: false, status: 404, message: 'Invitation not found' };
  if (!user) return { success: false, status: 404, message: 'User not found' };

  if (String(user.email || '').toLowerCase() !== String(invitation.email || '').toLowerCase()) {
    return { success: false, status: 403, message: 'This invitation is for a different email' };
  }

  const now = new Date();
  if (invitation.status === 'accepted' && isSameId(invitation.acceptedBy, userId)) {
    const membership = await ensureCompanyMembership(invitation, userId);
    if (!membership.company) return { success: false, status: 404, message: 'Company not found' };
    if (!membership.alreadyMember) {
      return { success: true, invitation, user, company: membership.company, alreadyAccepted: false };
    }
    return { success: true, invitation, user, company: membership.company, alreadyAccepted: true };
  }

  if (invitation.expiresAt <= now) {
    return { success: false, status: 400, message: 'Invitation expired' };
  }
  if (invitation.status !== 'pending') {
    return { success: false, status: 400, message: 'Invitation already processed' };
  }

  let accepted = await Invitation.findOneAndUpdate(
    { _id: invitation._id, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'accepted', acceptedAt: now, acceptedBy: userId } },
    { new: true }
  );
  let alreadyAccepted = false;
  if (!accepted) {
    const current = await Invitation.findById(invitation._id);
    if (current?.status === 'accepted' && isSameId(current.acceptedBy, userId)) {
      accepted = current;
      alreadyAccepted = true;
    } else if (!current) {
      return { success: false, status: 404, message: 'Invitation not found' };
    } else if (current.expiresAt <= now) {
      return { success: false, status: 400, message: 'Invitation expired' };
    } else {
      return { success: false, status: 400, message: 'Invitation already processed' };
    }
  }

  const membership = await ensureCompanyMembership(accepted, userId);
  if (!membership.company) return { success: false, status: 404, message: 'Company not found' };

  return {
    success: true,
    invitation: accepted,
    user,
    company: membership.company,
    alreadyAccepted,
  };
}

async function declineInvitation(token, userId) {
  const [invitation, user] = await Promise.all([
    Invitation.findOne({ token }),
    User.findById(userId),
  ]);
  if (!invitation) return { success: false, status: 404, message: 'Invitation not found' };
  if (!user) return { success: false, status: 404, message: 'User not found' };
  if (String(user.email || '').toLowerCase() !== String(invitation.email || '').toLowerCase()) {
    return { success: false, status: 403, message: 'This invitation is for a different email' };
  }

  const now = new Date();
  if (invitation.expiresAt <= now) {
    return { success: false, status: 400, message: 'Invitation expired' };
  }
  const declined = await Invitation.findOneAndUpdate(
    { _id: invitation._id, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'declined' } },
    { new: true }
  );
  if (!declined) {
    return { success: false, status: 400, message: 'Invitation already processed' };
  }
  return { success: true, invitation: declined };
}

module.exports = { acceptInvitation, declineInvitation };
