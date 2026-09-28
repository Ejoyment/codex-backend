#!/usr/bin/env node
const { runTierScript } = require('./lib/tierTools');

const usage = `Upgrade an account to a higher tier (test paid tiers without paying).

Usage:
  node scripts/upgrade-tier.js <email> [--tier pro] [options]
  node scripts/upgrade-tier.js --email <email> --tier <tier> [options]
  node scripts/upgrade-tier.js --userId <mongoObjectId> [--tier <tier>]

Options:
  --tier <tier>   Target tier (default: pro)
  --list          Show every tier and its restrictions, then exit
  --dry-run       Show before/after without writing anything
  --force         Allow setting a tier that is not actually higher
  --help          Show this help

Tiers (current lineup): developer, pro, team_standard, pro_plus, team_premium, enterprise

Examples:
  node scripts/upgrade-tier.js you@example.com
  node scripts/upgrade-tier.js you@example.com --tier team_premium
  node scripts/upgrade-tier.js you@example.com --tier enterprise --dry-run
  node scripts/upgrade-tier.js --list

Notes:
  - Mirrors the app's own /api/subscription/upgrade flow (Subscription.upgradeTo)
    plus a per-tier profile sync (credits, compute hours, agent jobs, debug rooms,
    deployments, spec engine, retention, team/SSO flags). Stripe/Paystack IDs,
    seats, dates and usage counters are preserved.
  - The change is read live from MongoDB — just refresh the app.`;

runTierScript({ direction: 'upgrade', defaultTier: 'pro', argv: process.argv.slice(2), usage })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
