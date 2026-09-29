#!/usr/bin/env node
/**
 * Idempotent: re-apply each subscription's tier restriction profile, and repair
 * trial rows whose recorded tier disagrees with their trial state.
 *
 * Why this exists: a subscription stores a *snapshot* of its tier's restrictions
 * (credits, compute hours, agent jobs, spec engine level, retention, team
 * flags). That snapshot drifts whenever the profile in Subscription.tierConfigs
 * changes, or when a row was written before a profile existed — the tier-name
 * migration, for instance, set tiers without re-syncing limits. Users then get
 * restrictions that do not match the tier they are on.
 *
 * It also repairs trials recorded as developer+trial: the trial grants Pro, so a
 * live trial is restored to Pro and an elapsed one is expired. Without this the
 * UI reports "Free" for a user who is actually trialing Pro.
 *
 * Only limit fields are written — pricing, payment fields and usage counters
 * (creditPool.usedThisMonth) are left untouched.
 *
 * Usage:
 *   node scripts/sync-tier-restrictions.js [--dry-run] [--verbose]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const { repairTrialTier } = require('../middleware/trial');

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

// Fields written by syncTierRestrictions, so a row that already matches its tier
// is a no-op instead of a write.
const RESTRICTION_FIELDS = [
  'creditPool.monthlyLimit',
  'cloudComputeHours.monthlyLimit',
  'maxConcurrentAgentJobs',
  'taskTimeoutMinutes',
  'maxDebugHostRooms',
  'maxDebugParticipants',
  'maxActiveDeployments',
  'specEngineLevel',
  'webrtcVoiceEnabled',
  'dataRetentionDays',
  'teamSpecLibrary',
  'teamRBAC',
];

function readPath(doc, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
}

function restrictionsMatchTier(subscription) {
  const config = Subscription.tierConfigs?.[subscription.tier];
  if (!config) return true; // unknown tier: nothing authoritative to compare
  const expected = {
    'creditPool.monthlyLimit': config.monthlyCreditLimit,
    'cloudComputeHours.monthlyLimit': config.cloudComputeHours,
    maxConcurrentAgentJobs: config.maxConcurrentJobs,
    taskTimeoutMinutes: config.taskTimeout,
    maxDebugHostRooms: config.maxDebugHostRooms,
    maxDebugParticipants: config.maxDebugParticipants,
    maxActiveDeployments: config.maxDeployments,
    specEngineLevel: config.specEngineLevel,
    webrtcVoiceEnabled: Boolean(config.webrtcEnabled),
    dataRetentionDays: config.dataRetentionDays,
    teamSpecLibrary: Boolean(config.features?.teamLibrary),
    teamRBAC: Boolean(config.features?.rbac),
  };
  return RESTRICTION_FIELDS.every((field) => {
    const want = expected[field];
    const have = readPath(subscription, field);
    if (want === undefined) return true;
    // String fields (specEngineLevel) must not go through Number(), or
    // "read_only" would compare as NaN !== NaN and flag every row forever.
    if (typeof want === 'string') return String(have) === want;
    if (typeof want === 'boolean') return Boolean(have) === want;
    // null means unlimited for enterprise; Infinity does not round-trip through
    // Mongo as a number, so treat it as equal to a missing/null limit.
    if (want === null || want === Infinity) return have === null || have === undefined || have === Infinity;
    return Number(have) === Number(want);
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const subscriptions = await Subscription.find({});
  const summary = {
    total: subscriptions.length,
    trialTierRepaired: 0,
    trialExpired: 0,
    restrictionsResynced: 0,
    alreadyConsistent: 0,
    unknownTier: 0,
  };

  for (const subscription of subscriptions) {
    const before = {
      tier: subscription.tier,
      status: subscription.status,
      specEngineLevel: subscription.specEngineLevel,
    };

    let changed = repairTrialTier(subscription);
    if (changed) {
      if (before.status === 'trial' && subscription.status === 'expired') summary.trialExpired += 1;
      else summary.trialTierRepaired += 1;
    }

    if (!Subscription.tierConfigs?.[subscription.tier]) {
      summary.unknownTier += 1;
    } else if (restrictionsMatchTier(subscription)) {
      if (!changed) summary.alreadyConsistent += 1;
    } else {
      subscription.syncTierRestrictions();
      summary.restrictionsResynced += 1;
      changed = true;
    }

    if (changed && !dryRun) await subscription.save();

    if (verbose || changed) {
      const marker = dryRun ? '[dry-run] ' : '';
      console.log(
        `${marker}user=${subscription.userId} ${before.tier}/${before.status} -> ${subscription.tier}/${subscription.status} ` +
        `specEngine ${before.specEngineLevel} -> ${subscription.specEngineLevel}` +
        (changed ? '' : ' (no change)')
      );
    }
  }

  console.log(`\n${dryRun ? 'Would sync' : 'Synced'} ${summary.total} subscription(s):`);
  console.log(`  trial tier repaired to the granted tier : ${summary.trialTierRepaired}`);
  console.log(`  elapsed trials expired                 : ${summary.trialExpired}`);
  console.log(`  restriction profiles re-applied        : ${summary.restrictionsResynced}`);
  console.log(`  already consistent                     : ${summary.alreadyConsistent}`);
  if (summary.unknownTier) console.log(`  unknown tier (left alone)              : ${summary.unknownTier}`);

  await mongoose.connection.close(false);
}

run().catch((err) => {
  console.error('Tier restriction sync failed:', err);
  process.exit(1);
});
