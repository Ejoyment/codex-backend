const { randomUUID } = require('crypto');
const EmailJob = require('../models/EmailJob');
const Invitation = require('../models/Invitation');
const emailService = require('./emailServiceResend');

const POLL_INTERVAL_MS = 1000;
const LOCK_DURATION_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_JOBS_PER_POLL = 5;

let timer = null;
let activePoll = null;

async function enqueueEmailJob(type, dedupeKey, payload) {
  try {
    return await EmailJob.create({ type, dedupeKey, payload });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await EmailJob.findOne({ dedupeKey });
    if (!existing) throw error;
    return existing;
  }
}

async function sendJob(job) {
  if (job.type === 'trial_welcome') {
    const result = await emailService.sendTrialWelcomeEmail(
      job.payload.email,
      job.payload.fullName,
      job.payload.trialEndsAt
    );
    if (result?.success === false) throw new Error(result.error || result.message || 'Trial welcome email failed');
    return;
  }

  if (job.type === 'invitation') {
    const invitation = await Invitation.findOne({
      _id: job.payload.invitationId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .populate('invitedBy', 'fullName email')
      .populate('company', 'name description');
    if (!invitation) return;
    const result = await emailService.sendInvitationEmail(invitation);
    if (result?.success === false) throw new Error(result.error || 'Invitation email failed');
    return;
  }

  throw new Error(`Unsupported email job type: ${job.type}`);
}

async function processNextEmailJob() {
  const now = new Date();
  const lockToken = randomUUID();
  const job = await EmailJob.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', availableAt: { $lte: now } },
        { status: 'processing', lockedUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        lockToken,
        lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { availableAt: 1, createdAt: 1 } }
  );
  if (!job) return false;

  try {
    await sendJob(job);
    await EmailJob.updateOne(
      { _id: job._id, status: 'processing', lockToken },
      {
        $set: { status: 'sent', sentAt: new Date() },
        $unset: { lockToken: 1, lockedUntil: 1, lastError: 1 },
      }
    );
  } catch (error) {
    const terminal = job.attempts >= MAX_ATTEMPTS;
    const delayMs = Math.min(30 * 1000 * (2 ** Math.max(0, job.attempts - 1)), 30 * 60 * 1000);
    await EmailJob.updateOne(
      { _id: job._id, status: 'processing', lockToken },
      {
        $set: {
          status: terminal ? 'failed' : 'pending',
          availableAt: new Date(Date.now() + delayMs),
          lastError: error.message,
        },
        $unset: { lockToken: 1, lockedUntil: 1 },
      }
    );
    console.error(`[email-job] ${terminal ? 'permanently failed' : 'delivery failed'} (${job.type}):`, error.message);
  }
  return true;
}

async function pollEmailJobs() {
  if (activePoll) return activePoll;
  activePoll = (async () => {
    for (let count = 0; count < MAX_JOBS_PER_POLL; count += 1) {
      if (!(await processNextEmailJob())) break;
    }
  })();
  try {
    await activePoll;
  } finally {
    activePoll = null;
  }
}

function startEmailJobWorker() {
  if (timer) return;
  timer = setInterval(() => {
    pollEmailJobs().catch((error) => console.error('[email-job] worker poll failed:', error.message));
  }, POLL_INTERVAL_MS);
  pollEmailJobs().catch((error) => console.error('[email-job] initial poll failed:', error.message));
}

async function stopEmailJobWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  if (activePoll) await activePoll;
}

module.exports = {
  enqueueEmailJob,
  processNextEmailJob,
  pollEmailJobs,
  startEmailJobWorker,
  stopEmailJobWorker,
};
