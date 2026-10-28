jest.mock('mongoose', () => ({ connection: { readyState: 1 } }));
jest.mock('../models/AdminAudit', () => ({ create: jest.fn() }));

const mongoose = require('mongoose');
const AdminAudit = require('../models/AdminAudit');
const { recordAdminAction } = require('../utils/adminAudit');

const req = {
  headers: {
    'x-admin-key': 'super-secret-admin-key',
    'x-forwarded-for': '203.0.113.9, 10.0.0.1',
  },
  socket: { remoteAddress: '10.0.0.2' },
};

beforeEach(() => {
  AdminAudit.create.mockReset();
  AdminAudit.create.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mongoose.connection.readyState = 1;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('records an admin action with a non-secret key fingerprint and client IP', async () => {
  await recordAdminAction({
    action: 'user.ban',
    target: '507f1f77bcf86cd799439011',
    details: { reason: 'abuse' },
    req,
  });

  expect(AdminAudit.create).toHaveBeenCalledWith(expect.objectContaining({
    action: 'user.ban',
    target: '507f1f77bcf86cd799439011',
    details: { reason: 'abuse' },
    ip: '203.0.113.9',
    adminKeyFingerprint: expect.stringMatching(/^[0-9a-f]{12}$/),
  }));
  const persisted = AdminAudit.create.mock.calls[0][0];
  expect(persisted.adminKeyFingerprint).not.toContain('super-secret-admin-key');
  expect(JSON.stringify(persisted)).not.toContain('super-secret-admin-key');
});

test('always emits the structured line and never throws if persistence fails', async () => {
  AdminAudit.create.mockRejectedValue(new Error('mongo down'));

  await expect(recordAdminAction({ action: 'user.unban', target: 'x', req })).resolves.toBeNull();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[admin-audit]'));
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('persist failed'));
});

test('skips persistence when Mongo is not connected but still logs', async () => {
  mongoose.connection.readyState = 0;

  await recordAdminAction({ action: 'company.roles.backfill', req });

  expect(AdminAudit.create).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('company.roles.backfill'));
});
