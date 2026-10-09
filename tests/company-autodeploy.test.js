/**
 * Server-side auto-deploy setting (Render-style toggle).
 *
 * - Company.settings.autoDeploy defaults true (current behavior preserved).
 * - PUT /:companyId/settings persists it (owner/admin only, like the rest).
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '507f1f77bcf86cd799439011';
    req.user = { _id: '507f1f77bcf86cd799439011' };
    next();
  },
}));
// Route-level matrix is covered elsewhere; here the handler's own
// owner/admin gate is under test.
jest.doMock('../middleware/permissionMatrix', () => ({
  requirePermission: () => (req, res, next) => next(),
}));

const Company = require('../models/Company');
const companyRouter = require('../routes/company');

const app = express();
app.use(express.json());
app.use('/api/company', companyRouter);

const OWNER = '507f1f77bcf86cd799439011';
const COMPANY_ID = '507f1f77bcf86cd799439022';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('company autoDeploy setting', () => {
  test('defaults to true on new documents', () => {
    const doc = new Company({ name: 'c', owner: new mongoose.Types.ObjectId() });
    expect(doc.settings.autoDeploy).toBe(true);
  });

  const companyDoc = (settings = {}) => ({
    _id: COMPANY_ID,
    members: [{ user: OWNER, role: 'owner' }],
    settings: { allowMemberInvites: false, requireApproval: true, defaultRole: 'member', autoDeploy: true, ...settings },
    save: jest.fn(async function () { return this; }),
  });

  test('PUT persists autoDeploy=false', async () => {
    const doc = companyDoc();
    jest.spyOn(Company, 'findById').mockResolvedValue(doc);
    const res = await request(app).put(`/api/company/${COMPANY_ID}/settings`).send({ autoDeploy: false });
    expect(res.status).toBe(200);
    expect(doc.settings.autoDeploy).toBe(false);
    expect(doc.save).toHaveBeenCalled();
    expect(res.body.settings.autoDeploy).toBe(false);
  });

  test('PUT persists autoDeploy=true', async () => {
    const doc = companyDoc({ autoDeploy: false });
    jest.spyOn(Company, 'findById').mockResolvedValue(doc);
    const res = await request(app).put(`/api/company/${COMPANY_ID}/settings`).send({ autoDeploy: true });
    expect(res.status).toBe(200);
    expect(doc.settings.autoDeploy).toBe(true);
  });

  test('non-admin cannot toggle', async () => {
    const doc = companyDoc();
    doc.members = [{ user: OWNER, role: 'member' }];
    jest.spyOn(Company, 'findById').mockResolvedValue(doc);
    const res = await request(app).put(`/api/company/${COMPANY_ID}/settings`).send({ autoDeploy: false });
    expect(res.status).toBe(403);
    expect(doc.settings.autoDeploy).toBe(true);
  });
});
