jest.mock('../models/EmailJob', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../models/Invitation', () => ({ findOne: jest.fn() }));
jest.mock('../utils/emailServiceResend', () => ({
  sendInvitationEmail: jest.fn(),
  sendTrialWelcomeEmail: jest.fn(),
}));

const EmailJob = require('../models/EmailJob');
const emailService = require('../utils/emailServiceResend');
const { enqueueEmailJob, processNextEmailJob } = require('../utils/emailJobWorker');

beforeEach(() => {
  jest.clearAllMocks();
  EmailJob.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

test('enqueues a durable deduplicated job without sending it inline', async () => {
  const job = { _id: 'job-id', type: 'trial_welcome' };
  EmailJob.create.mockResolvedValue(job);

  await expect(enqueueEmailJob('trial_welcome', 'signup:user', { email: 'person@example.com' }))
    .resolves.toBe(job);
  expect(EmailJob.create).toHaveBeenCalledWith({
    type: 'trial_welcome',
    dedupeKey: 'signup:user',
    payload: { email: 'person@example.com' },
  });
  expect(emailService.sendTrialWelcomeEmail).not.toHaveBeenCalled();
});

test('atomically claims and completes a queued welcome email', async () => {
  EmailJob.findOneAndUpdate.mockResolvedValue({
    _id: 'job-id',
    type: 'trial_welcome',
    attempts: 1,
    payload: { email: 'person@example.com', fullName: 'Person', trialEndsAt: new Date() },
    lockToken: 'worker-token',
  });
  emailService.sendTrialWelcomeEmail.mockResolvedValue({ success: true });

  await expect(processNextEmailJob()).resolves.toBe(true);
  expect(EmailJob.findOneAndUpdate).toHaveBeenCalledWith(
    { $or: expect.arrayContaining([
      expect.objectContaining({ status: 'pending' }),
      expect.objectContaining({ status: 'processing' }),
    ]) },
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'processing', lockToken: expect.any(String) }),
      $inc: { attempts: 1 },
    }),
    expect.objectContaining({ new: true })
  );
  expect(emailService.sendTrialWelcomeEmail).toHaveBeenCalledTimes(1);
  expect(EmailJob.updateOne).toHaveBeenCalledWith(
    { _id: 'job-id', status: 'processing', lockToken: expect.any(String) },
    expect.objectContaining({ $set: expect.objectContaining({ status: 'sent' }) })
  );
});
