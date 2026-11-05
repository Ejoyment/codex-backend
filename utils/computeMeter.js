const MIN_METERED_HOURS = 1 / 60;
const METERED_STATUSES = new Set([
  'awaiting_review',
  'awaiting_approval',
  'approved',
  'rejected',
  'completed',
  'failed',
]);

function hoursBetween(startedAt, completedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return MIN_METERED_HOURS;
  }
  return Math.max((end - start) / 3600000, MIN_METERED_HOURS);
}

async function meterExecution(executionId) {
  const AgentExecution = require('../models/AgentExecution');
  const Subscription = require('../models/Subscription');

  const execution = await AgentExecution.findById(executionId)
    .select('userId status startedAt completedAt computeHoursMeteredAt computeReservationHours')
    .lean();
  if (!execution) return { metered: false, reason: 'execution not found' };
  if (!METERED_STATUSES.has(execution.status)) return { metered: false, reason: 'not terminal' };
  if (!execution.startedAt || !execution.completedAt) return { metered: false, reason: 'missing timestamps' };
  if (execution.computeHoursMeteredAt) return { metered: false, reason: 'already metered' };

  const subscription = await Subscription.findOne({ userId: execution.userId }).select('tier').lean();
  if (!subscription || subscription.tier === 'developer') {
    return { metered: false, reason: 'no cloud compute entitlement' };
  }

  const hours = hoursBetween(execution.startedAt, execution.completedAt);
  const claimed = await AgentExecution.findOneAndUpdate(
    { _id: executionId, computeHoursMeteredAt: null },
    { $set: { computeHoursMeteredAt: new Date(), computeHours: hours } },
    { new: false }
  );
  if (!claimed) return { metered: false, reason: 'already metered' };

  const CreditPoolService = require('./creditPoolService');
  const result = await CreditPoolService.deductComputeHours(execution.userId, hours, {
    reservedHours: execution.computeReservationHours || 0,
  });
  if (!result.success) {
    console.warn(`Compute metering for ${executionId} recorded ${hours.toFixed(4)}h but was not charged: ${result.message}`);
  }
  return { metered: true, hours, charged: result.success, result };
}

module.exports = { MIN_METERED_HOURS, hoursBetween, meterExecution };
