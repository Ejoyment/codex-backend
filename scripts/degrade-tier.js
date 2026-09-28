#!/usr/bin/env node
const { runTierScript } = require('./lib/tierTools');

const usage = `Degrade an account to a lower tier (test free-tier restrictions).

Usage:
  node scripts/degrade-tier.js <email> [--tier developer] [options]
  node scripts/degrade-tier.js --email <email> --tier <tier> [options]
  node scripts/degrade-tier.js --userId <mongoObjectId> [--tier <tier>]

Options:
  --tier <tier>   Target tier (default: developer)
  --list          Show every tier and its restrictions, then exit
  --dry-run       Show before/after without writing anything
  --force         Allow setting a tier that is not actually lower
  --help          Show this help

Tiers (current lineup): developer, pro, team_standard, pro_plus, team_premium, enterprise
Legacy tiers (still valid): freebie, starter, professional

Examples:
  node scripts/degrade-tier.js you@example.com
  node scripts/degrade-tier.js you@example.com --tier freebie
  node scripts/degrade-tier.js you@example.com --dry-run
  node scripts/degrade-tier.js --list

Notes:
  - Mirrors the app's own /api/subscription/cancel downgrade plus the same
    per-tier profile sync as upgrade-tier.js. Status, payment IDs, seats, dates
    and usage counters are preserved.
  - The change is read live from MongoDB — just refresh the app.`;

runTierScript({ direction: 'degrade', defaultTier: 'developer', argv: process.argv.slice(2), usage })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
