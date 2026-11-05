jest.mock('../models/Invitation', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../models/Company', () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../models/User', () => ({ findById: jest.fn() }));

const Invitation = require('../models/Invitation');
const Company = require('../models/Company');
const User = require('../models/User');
const { acceptInvitation, declineInvitation } = require('../utils/invitationService');

const invitation = (overrides = {}) => ({
  _id: 'invite-id',
  token: 'invite-token',
  email: 'person@example.com',
  company: 'company-id',
  role: 'member',
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  Invitation.findOne.mockResolvedValue(invitation());
  User.findById.mockResolvedValue({ _id: 'user-id', email: 'person@example.com' });
  Invitation.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
    ...invitation(),
    ...update.$set,
  }));
  Company.findOneAndUpdate.mockResolvedValue({
    _id: 'company-id',
    members: [{ user: 'user-id', role: 'member' }],
  });
});

describe('acceptInvitation', () => {
  test('atomically claims a pending invitation and adds membership once', async () => {
    const result = await acceptInvitation('invite-token', 'user-id');

    expect(result.success).toBe(true);
    expect(Invitation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'invite-id', status: 'pending', expiresAt: { $gt: expect.any(Date) } },
      { $set: expect.objectContaining({ status: 'accepted', acceptedBy: 'user-id' }) },
      { new: true }
    );
    expect(Company.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'company-id', 'members.user': { $ne: 'user-id' } },
      { $addToSet: { members: { user: 'user-id', role: 'member' } } },
      { new: true }
    );
  });

  test('rejects a token when the authenticated user email does not match', async () => {
    User.findById.mockResolvedValue({ _id: 'user-id', email: 'other@example.com' });

    await expect(acceptInvitation('invite-token', 'user-id')).resolves.toMatchObject({
      success: false,
      status: 403,
    });
    expect(Invitation.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Company.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('repairs membership for a previously accepted invitation without duplicating it', async () => {
    Invitation.findOne.mockResolvedValue(invitation({ status: 'accepted', acceptedBy: 'user-id' }));
    Company.findOneAndUpdate.mockResolvedValue(null);
    Company.findById.mockResolvedValue({
      _id: 'company-id',
      members: [{ user: 'user-id', role: 'member' }],
    });

    await expect(acceptInvitation('invite-token', 'user-id')).resolves.toMatchObject({
      success: true,
      alreadyAccepted: true,
    });
    expect(Invitation.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('concurrent accepts converge on one accepted state and one membership entry', async () => {
    let accepted;
    Invitation.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      if (accepted) return null;
      accepted = { ...invitation(), ...update.$set };
      return accepted;
    });
    Invitation.findById.mockImplementation(async () => accepted);
    let companyMember;
    Company.findOneAndUpdate.mockImplementation(async () => {
      if (companyMember) return null;
      companyMember = { _id: 'company-id', members: [{ user: 'user-id', role: 'member' }] };
      return companyMember;
    });
    Company.findById.mockImplementation(async () => companyMember);

    const results = await Promise.all([
      acceptInvitation('invite-token', 'user-id'),
      acceptInvitation('invite-token', 'user-id'),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    expect(Invitation.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(Company.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('declineInvitation', () => {
  test('atomically declines only a matching, pending invitation', async () => {
    const result = await declineInvitation('invite-token', 'user-id');
    expect(result.success).toBe(true);
    expect(Invitation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'invite-id', status: 'pending', expiresAt: { $gt: expect.any(Date) } },
      { $set: { status: 'declined' } },
      { new: true }
    );
  });

  test('does not allow another account to decline the invitation', async () => {
    User.findById.mockResolvedValue({ _id: 'user-id', email: 'other@example.com' });

    await expect(declineInvitation('invite-token', 'user-id')).resolves.toMatchObject({
      success: false,
      status: 403,
    });
    expect(Invitation.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
