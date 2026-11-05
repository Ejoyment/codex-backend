jest.mock('../models/AuditLog', () => ({ create: jest.fn() }));
jest.mock('../models/AuditOutbox', () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  updateOne: jest.fn(),
}));

const AuditLog = require('../models/AuditLog');
const AuditOutbox = require('../models/AuditOutbox');
const { addAuditLog } = require('../utils/auditLogService');
const { processNextAuditJob } = require('../utils/auditOutboxWorker');

const event = (overrides = {}) => ({
  companyId: '507f1f77bcf86cd799439011',
  actorId: '507f1f77bcf86cd799439012',
  email: 'owner@example.com',
  event: 'git.push',
  category: 'git',
  target: 'repo/main',
  details: { branch: 'main' },
  req: { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, socket: {} },
  ...overrides,
});

const queuedJob = (overrides = {}) => ({
  _id: '507f1f77bcf86cd799439013',
  payload: {
    companyId: '507f1f77bcf86cd799439011',
    actorId: '507f1f77bcf86cd799439012',
    email: 'owner@example.com',
    event: 'git.push',
    category: 'git',
    target: 'repo/main',
    details: { branch: 'main' },
    ip: '203.0.113.5',
  },
  attempts: 1,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  AuditOutbox.deleteOne.mockResolvedValue({ deletedCount: 1 });
  AuditOutbox.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('audit log writes', () => {
  test('writes directly when the audit collection is available', async () => {
    AuditLog.create.mockResolvedValue({ _id: 'audit-1' });

    const result = await addAuditLog(event());

    expect(result).toEqual({ _id: 'audit-1' });
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      company: '507f1f77bcf86cd799439011',
      actor: '507f1f77bcf86cd799439012',
      event: 'git.push',
      category: 'git',
      ip: '203.0.113.5',
    }));
    expect(AuditOutbox.create).not.toHaveBeenCalled();
  });

  test('queues a durable outbox job when the direct write fails', async () => {
    AuditLog.create.mockRejectedValue(new Error('replica unavailable'));
    AuditOutbox.create.mockResolvedValue({ _id: 'outbox-1', status: 'pending' });

    const result = await addAuditLog(event());

    expect(result).toEqual({ _id: 'outbox-1', status: 'pending' });
    expect(AuditOutbox.create).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ event: 'git.push', ip: '203.0.113.5' }),
      lastError: 'replica unavailable',
    }));
  });

  test('skips events without a workspace', async () => {
    const result = await addAuditLog(event({ companyId: null }));

    expect(result).toBeNull();
    expect(AuditLog.create).not.toHaveBeenCalled();
    expect(AuditOutbox.create).not.toHaveBeenCalled();
  });
});

describe('audit outbox worker', () => {
  test('writes a queued event and deletes the job', async () => {
    AuditOutbox.findOneAndUpdate.mockResolvedValue(queuedJob());
    AuditLog.create.mockResolvedValue({ _id: 'audit-2' });

    const processed = await processNextAuditJob();

    expect(processed).toBe(true);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      event: 'git.push',
      sourceId: '507f1f77bcf86cd799439013',
    }));
    expect(AuditOutbox.deleteOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439013',
      status: 'processing',
      lockToken: expect.any(String),
    });
  });

  test('treats a duplicate audit row as delivered', async () => {
    AuditOutbox.findOneAndUpdate.mockResolvedValue(queuedJob());
    AuditLog.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    const processed = await processNextAuditJob();

    expect(processed).toBe(true);
    expect(AuditOutbox.deleteOne).toHaveBeenCalled();
    expect(AuditOutbox.updateOne).not.toHaveBeenCalled();
  });

  test('reschedules a failed job with backoff', async () => {
    AuditOutbox.findOneAndUpdate.mockResolvedValue(queuedJob({ attempts: 2 }));
    AuditLog.create.mockRejectedValue(new Error('still down'));

    const processed = await processNextAuditJob();

    expect(processed).toBe(true);
    expect(AuditOutbox.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '507f1f77bcf86cd799439013', status: 'processing' }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'pending', lastError: 'still down' }),
        $unset: { lockToken: 1, lockedUntil: 1 },
      })
    );
  });

  test('marks a job failed after the attempt cap', async () => {
    AuditOutbox.findOneAndUpdate.mockResolvedValue(queuedJob({ attempts: 10 }));
    AuditLog.create.mockRejectedValue(new Error('still down'));

    await processNextAuditJob();

    expect(AuditOutbox.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'failed' }) })
    );
  });

  test('returns false when no job is ready', async () => {
    AuditOutbox.findOneAndUpdate.mockResolvedValue(null);

    await expect(processNextAuditJob()).resolves.toBe(false);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});
