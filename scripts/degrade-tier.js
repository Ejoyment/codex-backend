#!/usr/bin/env node
const { runTierScript } = require('./lib/tierTools');

const usage = `Degrade an account to a lower tier (test free-tier restrictions).

Usage:
  node scripts/degrade-tier.js <email> [--tier freebie] [options]
  node scripts/degrade-tier.js --email <email> --tier <tier> [options]
  node scripts/degrade-tier.js --userId <mongoObjectId> [--tier <tier>]

Options:
  --tier <tier>   Target tier (default: freebie)
  --dry-run       Show before/after without writing anything
  --force         Allow setting a tier that is not actually lower
  --help          Show this help

Examples:
  node scripts/degrade-tier.js you@example.com
  node scripts/degrade-tier.js you@example.com --tier developer
  node scripts/degrade-tier.js you@example.com --dry-run

Notes:
  - Mirrors the app's own /api/subscription/cancel downgrade: tier, features and
    pricing are updated via the same upgradeTo() the app uses. Nothing else is
    touched — status, payment IDs, seats, dates and usage counters are preserved.
  - The change is read live from MongoDB — just refresh the app.`;

runTierScript({ direction: 'degrade', defaultTier: 'freebie', argv: process.argv.slice(2), usage })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
