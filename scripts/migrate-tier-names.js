#!/usr/bin/env node
/**
 * Idempotent migration: canonicalize legacy tier names to the six-tier lineup.
 *
 *   freebie / starter / trial / free / basic / hobby -> developer
 *   professional -> pro
 *   business / team -> enterprise
 *
 * Covers every collection that stores a tier/plan enum:
 *   - Subscription.tier
 *   - Company.subscription.tier
 *   - Entitlement.plan
 *
 * Safe to re-run (filters only match legacy values).
 * Usage: node scripts/migrate-tier-names.js [--dry-run]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const Company = require('../models/Company');
const { LEGACY_TIER_MAP } = require('../utils/tierNames');

const dryRun = process.argv.includes('--dry-run');

async function countLegacy(Model, field) {
  const values = Object.keys(LEGACY_TIER_MAP).filter((k) => LEGACY_TIER_MAP[k] !== k);
  return Model.countDocuments({ [field]: { $in: values } });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected. ${dryRun ? '[DRY RUN - no writes]' : ''}\n`);

  let total = 0;
  const pairs = Object.entries(LEGACY_TIER_MAP).filter(([from, to]) => from !== to);

  // Entitlement model is optional (phase 3 collections may not exist yet).
  const models = [
    { name: 'Subscription', Model: Subscription, field: 'tier' },
    { name: 'Company', Model: Company, field: 'subscription.tier' },
  ];
  try {
    const Entitlement = require('../server/models/EntitlementModel');
    models.push({ name: 'Entitlement', Model: Entitlement, field: 'plan' });
  } catch (e) {
    console.log('Entitlement model unavailable — skipping.');
  }

  for (const { name, Model, field } of models) {
    for (const [from, to] of pairs) {
      const filter = { [field]: from };
      if (dryRun) {
        const n = await Model.countDocuments(filter);
        if (n) console.log(`  ${name}.${field}: ${n} x ${from} -> ${to}`);
        total += n;
      } else {
        const res = await Model.updateMany(filter, { $set: { [field]: to } });
        if (res.modifiedCount) {
          console.log(`  ${name}.${field}: ${res.modifiedCount} x ${from} -> ${to}`);
          total += res.modifiedCount;
        }
      }
    }
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${total} document(s).`);
  await mongoose.connection.close(false);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
