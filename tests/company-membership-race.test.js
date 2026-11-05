const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    next();
  },
}));
jest.mock('../middleware/permissionMatrix', () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));
jest.mock('../middleware/teamRestrictions', () => ({
  checkMemberLimit: (_req, _res, next) => next(),
  checkProjectLimit: () => (_req, _res, next) => next(),
  requireTeamFeature: () => (_req, _res, next) => next(),
  getCompanyLimits: jest.fn(),
}));
jest.mock('../models/Company', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../models/TeamActivity', () => ({ create: jest.fn() }));

const Company = require('../models/Company');
const User = require('../models/User');
const TeamActivity = require('../models/TeamActivity');
const companyRouter = require('../routes/company');

const app = express();
app.use(express.json());
app.use('/api/company', companyRouter);

const COMPANY_ID = '507f1f77bcf86cd799439022';
const OWNER_ID = '507f1f77bcf86cd799439011';
const INVITEE_ID = '507f1f77bcf86cd799439033';

function companyWith(members) {
  return {
    _id: COMPANY_ID,
    members,
    subscription: { memberLimit: 2 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const initial = companyWith([{ user: OWNER_ID, role: 'owner' }]);
  const updated = companyWith([
    { user: OWNER_ID, role: 'owner' },
    { user: INVITEE_ID, role: 'member' },
  ]);
  let added = false;
  let initialReads = 0;
  let releaseInitialReads;
  const bothInitialReads = new Promise((resolve) => {
    releaseInitialReads = resolve;
  });
  Company.findById.mockImplementation(async () => {
    if (initialReads < 2) {
      initialReads += 1;
      if (initialReads === 2) releaseInitialReads();
      await bothInitialReads;
      return initial;
    }
    return added ? updated : initial;
  });
  Company.findOneAndUpdate.mockImplementation(async () => {
    if (added) return null;
    added = true;
    return updated;
  });
  User.findOne.mockResolvedValue({ _id: INVITEE_ID, fullName: 'Invitee' });
  TeamActivity.create.mockResolvedValue({});
});

test('simultaneous member invites claim only one slot and do not duplicate membership', async () => {
  const sendInvite = () => request(app)
    .post(`/api/company/${COMPANY_ID}/invite`)
    .send({ email: 'invitee@example.com' });

  const results = await Promise.all([sendInvite(), sendInvite()]);

  expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  expect(Company.findOneAndUpdate).toHaveBeenCalledTimes(2);
  expect(Company.findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: COMPANY_ID,
      'members.user': { $ne: INVITEE_ID },
      $expr: {
        $lt: [
          { $size: { $ifNull: ['$members', []] } },
          { $ifNull: ['$subscription.memberLimit', 1] },
        ],
      },
    }),
    expect.objectContaining({
      $addToSet: { members: expect.objectContaining({ user: INVITEE_ID, role: 'member' }) },
    }),
    { new: true }
  );
  expect(TeamActivity.create).toHaveBeenCalledTimes(1);
});
