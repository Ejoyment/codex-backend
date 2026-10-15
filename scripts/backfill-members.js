#!/usr/bin/env node
/**
 * Backfill bare-ObjectId members arrays to { user } subdocs
 * (TeamProject, LocalProject), matching Channel/Company shape.
 *
 * Readers already accept both shapes (utils/members.js), so this is safe to
 * run anytime — it just converges storage. Dry-run by default.
 *
 * Usage: node scripts/backfill-members.js [--apply]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const MODELS = ['../models/TeamProject', '../models/LocalProject'];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected to ${mongoose.connection.name}. ${APPLY ? 'APPLYING writes.' : 'DRY RUN — no writes (pass --apply).'}`);
  for (const modelPath of MODELS) {
    const Model = require(modelPath);
    const cursor = Model.find({}).select('members').cursor();
    let scanned = 0;
    let fixed = 0;
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
      scanned += 1;
      const members = doc.members || [];
      if (!members.some((m) => !m || typeof m !== 'object' || m.user === undefined)) continue;
      const converted = members.map((m) => {
        if (m && typeof m === 'object' && m.user !== undefined) return m;
        return { user: m };
      });
      if (APPLY) await Model.updateOne({ _id: doc._id }, { $set: { members: converted } });
      fixed += 1;
    }
    console.log(`${modelPath}: scanned ${scanned}, ${APPLY ? 'converted' : 'would convert'} ${fixed}`);
  }
  await mongoose.connection.close(false);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message); process.exit(1); });
