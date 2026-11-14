const { randomUUID } = require('crypto');
const AuditOutbox = require('../models/AuditOutbox');
const { writeAuditLog } = require('./auditLogService');

const POLL_INTERVAL_MS = 30 * 1000;
const LOCK_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_JOBS_PER_POLL = 25;
const TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let timer = null;
let activePoll = null;

async function processNextAuditJob() {
  const now = new Date();
  const lockToken = randomUUID();
  const job = await AuditOutbox.findOneAndUpdate(
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
    await writeAuditLog(job.payload, String(job._id));
    await AuditOutbox.deleteOne({ _id: job._id, status: 'processing', lockToken });
  } catch (error) {
    // A duplicate sourceId means the audit row was already written on a prior
    // attempt; treat it as success and drop the job.
    if (error.code === 11000) {
      await AuditOutbox.deleteOne({ _id: job._id, status: 'processing', lockToken });
      return true;
    }
    const terminal = job.attempts >= MAX_ATTEMPTS;
    const delayMs = Math.min(30 * 60 * 1000, 1000 * (2 ** Math.max(0, job.attempts - 1)));
    await AuditOutbox.updateOne(
      { _id: job._id, status: 'processing', lockToken },
      {
        $set: {
          status: terminal ? 'failed' : 'pending',
          availableAt: new Date(Date.now() + delayMs),
          lastError: error.message,
          ...(terminal ? { purgeAt: new Date(Date.now() + TERMINAL_RETENTION_MS) } : {}),
        },
        $unset: { lockToken: 1, lockedUntil: 1, ...(terminal ? {} : { purgeAt: 1 }) },
      }
    );
    console.error(`[audit-outbox] ${terminal ? 'permanently failed' : 'retry scheduled'}:`, error.message);
  }
  return true;
}

async function pollAuditOutbox() {
  if (activePoll) return activePoll;
  activePoll = (async () => {
    for (let count = 0; count < MAX_JOBS_PER_POLL; count += 1) {
      if (!(await processNextAuditJob())) break;
    }
  })();
  try {
    await activePoll;
  } finally {
    activePoll = null;
  }
}

function startAuditOutboxWorker() {
  if (timer) return;
  timer = setInterval(() => {
    pollAuditOutbox().catch((error) => console.error('[audit-outbox] poll failed:', error.message));
  }, POLL_INTERVAL_MS);
  if (timer.unref) timer.unref();
  pollAuditOutbox().catch((error) => console.error('[audit-outbox] initial poll failed:', error.message));
}

async function stopAuditOutboxWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  if (activePoll) await activePoll;
}

module.exports = {
  processNextAuditJob,
  pollAuditOutbox,
  startAuditOutboxWorker,
  stopAuditOutboxWorker,
};
