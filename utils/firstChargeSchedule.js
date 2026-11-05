const BillingSchedule = require('../models/BillingSchedule');
const { planAmountCents } = require('./billingPricing');

async function scheduleFirstCharge({ userId, subscriptionId, cardAddedAt, tier, provider }) {
  const existing = await BillingSchedule.findOne({
    subscriptionId,
    chargeType: 'first_charge',
  });
  if (existing) return existing;

  const scheduledFor = new Date(cardAddedAt.getTime() + (14 * 24 * 60 * 60 * 1000));
  const idempotencyKey = `first_charge:${subscriptionId}`;
  const fields = {
    userId,
    subscriptionId,
    provider,
    chargeType: 'first_charge',
    scheduledFor,
    amount: planAmountCents(tier),
    status: 'pending',
    idempotencyKey,
  };

  try {
    return await BillingSchedule.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: fields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await BillingSchedule.findOne({ idempotencyKey });
    if (!winner) throw error;
    return winner;
  }
}

module.exports = { scheduleFirstCharge };
