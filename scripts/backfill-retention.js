#!/usr/bin/env node
/**
 * Backfill expiresAt for rows created before the retention pass added the
 * field (AuditLog, DebugHandoff, CollaborationSession). TTL indexes ignore
 * rows without expiresAt, so without this old rows live forever.
 *
 * Usage: node scripts/backfill-retention.js [--apply]
 * Default is dry-run (counts only). --apply writes. Windows mirror the
 * model defaults (env-aware, same vars).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const DAY = 24 * 60 * 60 * 1000;

const TARGETS = [
  { model: '../models/AuditLog', days: () => parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10) },
  { model: '../models/DebugHandoff', days: () => parseInt(process.env.DEBUG_HANDOFF_TTL_DAYS || '30', 10) },
  { model: '../models/CollaborationSession', days: () => parseInt(process.env.COLLAB_SESSION_TTL_DAYS || '7', 10) },
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected to ${mongoose.connection.name}. ${APPLY ? 'APPLYING writes.' : 'DRY RUN — no writes (pass --apply).'}`);
  for (const { model: modelPath, days } of TARGETS) {
    const Model = require(modelPath);
    const windowMs = days() * DAY;
    const cursor = Model.find({ expiresAt: null }).select('_id createdAt').cursor();
    let scanned = 0;
    let fixed = 0;
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
      scanned += 1;
      const base = doc.createdAt || new Date();
      const expiresAt = new Date(base.getTime() + windowMs);
      if (APPLY) await Model.updateOne({ _id: doc._id }, { $set: { expiresAt } });
      fixed += 1;
    }
    console.log(`${modelPath}: scanned ${scanned}, ${APPLY ? 'backfilled' : 'would backfill'} ${fixed} (window ${days()}d)`);
  }
  await mongoose.connection.close(false);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message); process.exit(1); });
