#!/usr/bin/env node
const { runTierScript } = require('./lib/tierTools');

const usage = `Upgrade an account to a higher tier (test paid features without paying).

Usage:
  node scripts/upgrade-tier.js <email> [--tier professional] [options]
  node scripts/upgrade-tier.js --email <email> --tier <tier> [options]
  node scripts/upgrade-tier.js --userId <mongoObjectId> [--tier <tier>]

Options:
  --tier <tier>   Target tier (default: professional)
  --dry-run       Show before/after without writing anything
  --force         Allow setting a tier that is not actually higher
  --help          Show this help

Examples:
  node scripts/upgrade-tier.js you@example.com
  node scripts/upgrade-tier.js you@example.com --tier enterprise
  node scripts/upgrade-tier.js you@example.com --tier enterprise --dry-run

Notes:
  - Mirrors the app's own /api/subscription/upgrade flow: only tier, features,
    pricing, status and a metadata marker are touched. Stripe/Paystack IDs,
    seats, dates and usage counters are preserved.
  - The change is read live from MongoDB — just refresh the app.`;

runTierScript({ direction: 'upgrade', defaultTier: 'professional', argv: process.argv.slice(2), usage })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
