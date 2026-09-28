const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

const VALID_TIERS = [
  'developer', 'pro', 'pro_plus', 'team_standard', 'team_premium',
  'enterprise', 'starter', 'freebie', 'professional'
];

const CANONICAL_TIERS = ['freebie', 'professional', 'enterprise'];

const TIER_RANK = {
  developer: 0,
  freebie: 1,
  starter: 2,
  pro: 3,
  team_standard: 3,
  pro_plus: 4,
  professional: 4,
  team_premium: 5,
  enterprise: 6
};

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    force: false,
    help: false,
    email: null,
    userId: null,
    tier: null,
    positional: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--email') opts.email = argv[++i];
    else if (a.startsWith('--email=')) opts.email = a.slice('--email='.length);
    else if (a === '--userId' || a === '--user-id') opts.userId = argv[++i];
    else if (a.startsWith('--userId=')) opts.userId = a.slice('--userId='.length);
    else if (a.startsWith('--user-id=')) opts.userId = a.slice('--user-id='.length);
    else if (a === '--tier') opts.tier = argv[++i];
    else if (a.startsWith('--tier=')) opts.tier = a.slice('--tier='.length);
    else if (!a.startsWith('-')) opts.positional.push(a);
  }
  if (!opts.email && opts.positional.length > 0) opts.email = opts.positional[0];
  return opts;
}

async function findUser({ email, userId }) {
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    const user = await User.findById(userId);
    if (!user) throw new Error(`No user found with id ${userId}`);
    return user;
  }
  const normalized = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalized });
  if (!user) throw new Error(`No user found with email ${normalized}`);
  return user;
}

function loadSubscription(user) {
  return Subscription.findOne({ userId: user._id });
}

function snapshot(subscription) {
  return {
    tier: subscription.tier || 'none',
    status: subscription.status,
    features: { ...(subscription.features || {}) },
    pricing: { ...(subscription.pricing || {}) },
    paymentProvider: subscription.paymentProvider,
    customerId: subscription.customerId,
    paymentId: subscription.paymentId,
    creditPoolUsed: subscription.creditPool ? subscription.creditPool.usedThisMonth : 0,
    cloudHoursUsed: subscription.cloudComputeHours ? subscription.cloudComputeHours.usedThisMonth : 0
  };
}

function printSnapshot(label, snap) {
  console.log(`  ${label}`);
  console.log(`    tier:            ${snap.tier}`);
  console.log(`    status:          ${snap.status}`);
  console.log(`    features.advancedAiAssistance: ${snap.features.advancedAiAssistance === true}`);
  console.log(`    features.unlimitedProjects:    ${snap.features.unlimitedProjects === true}`);
  console.log(`    pricing.amount:  ${snap.pricing.amount} ${snap.pricing.currency || ''} / ${snap.pricing.interval || '-'}`);
  console.log(`    paymentProvider: ${snap.paymentProvider}  customerId: ${snap.customerId || '-'}  paymentId: ${snap.paymentId || '-'}`);
  console.log(`    creditPool.used: ${snap.creditPoolUsed}  cloudHours.used: ${snap.cloudHoursUsed}`);
}

async function applyTier({ user, subscription, tier, direction, dryRun, force }) {
  const target = String(tier || '').trim().toLowerCase();
  if (!VALID_TIERS.includes(target)) {
    throw new Error(`Invalid tier "${tier}". Valid tiers: ${VALID_TIERS.join(', ')}`);
  }

  const isNewRecord = subscription ? subscription.isNew : true;
  const current = subscription ? (subscription.tier || 'none') : 'none (no record)';

  console.log(`\nTarget: ${user.email} (${user._id})`);
  console.log(`Action: ${direction} ${current} -> ${target}${dryRun ? '  [DRY RUN - no changes will be written]' : ''}`);

  const warnings = [];
  if (!CANONICAL_TIERS.includes(target)) {
    warnings.push(`"${target}" is a legacy tier. Frontend feature gates (lib/tier.js) only recognize ${CANONICAL_TIERS.join(', ')} — UI limits may fall back to freebie.`);
  }
  if (subscription && CANONICAL_TIERS.includes(String(subscription.tier)) === false && subscription.tier !== target) {
    warnings.push(`Current tier "${subscription.tier}" is also legacy; permissionMatrix aliases: pro→professional, starter/trial→freebie-ish.`);
  }
  warnings.forEach((w) => console.log(`  WARNING: ${w}`));

  if (subscription && subscription.tier === target) {
    console.log(`\nAlready on "${target}" — nothing to do.`);
    return { changed: false, created: false };
  }

  if (subscription && !force) {
    const currentRank = TIER_RANK[subscription.tier];
    const targetRank = TIER_RANK[target];
    const ok = direction === 'upgrade' ? targetRank > currentRank : targetRank < currentRank;
    if (!ok) {
      throw new Error(
        `Refused: ${subscription.tier} -> ${target} is not a ${direction}. ` +
        `Use --force to set it anyway.`
      );
    }
  }

  if (!subscription) {
    console.log(`  No subscription record — one will be created (same as app registration flow).`);
  }

  const before = snapshot(subscription || new Subscription({ userId: user._id }));
  printSnapshot('BEFORE:', before);

  if (dryRun) {
    const preview = new Subscription({ userId: user._id, ...(subscription ? subscription.toObject() : {}) });
    preview.upgradeTo(target);
    if (direction === 'upgrade') preview.status = 'active';
    const after = snapshot(preview);
    printSnapshot('AFTER (would be):', after);
    console.log(`\nDry run complete — no changes written.`);
    return { changed: false, created: false, dryRun: true };
  }

  if (!subscription) {
    subscription = new Subscription({ userId: user._id, status: 'active' });
  }

  subscription.upgradeTo(target);
  if (direction === 'upgrade') {
    subscription.status = 'active';
  }
  subscription.metadata = {
    ...(subscription.metadata || {}),
    tierTool: {
      action: direction,
      from: before.tier,
      to: target,
      at: new Date().toISOString()
    }
  };

  await subscription.save();

  const after = snapshot(subscription);
  printSnapshot('AFTER:', after);

  const preserved =
    after.paymentProvider === before.paymentProvider &&
    after.customerId === before.customerId &&
    after.paymentId === before.paymentId &&
    after.creditPoolUsed === before.creditPoolUsed &&
    after.cloudHoursUsed === before.cloudHoursUsed;
  console.log(`\n  Preserved billing + usage counters: ${preserved ? 'yes' : 'NO — verify!'}`);
  console.log(`  Subscription record: ${isNewRecord ? 'created' : 'updated'} (id ${subscription._id})`);
  console.log(`\nDone. The change is read live from the DB — just refresh the app (no restart needed).`);
  return { changed: true, created: isNewRecord };
}

async function runTierScript({ direction, defaultTier, argv, usage }) {
  const opts = parseArgs(argv);
  if (opts.help || (!opts.email && !opts.userId)) {
    console.log(usage);
    console.log(`Valid tiers: ${VALID_TIERS.join(', ')}`);
    console.log(`Canonical (recommended): ${CANONICAL_TIERS.join(', ')}`);
    process.exit(opts.help ? 0 : 1);
  }

  const tier = opts.tier || defaultTier;
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const user = await findUser(opts);
    let subscription = await loadSubscription(user);
    await applyTier({
      user,
      subscription,
      tier,
      direction,
      dryRun: opts.dryRun,
      force: opts.force
    });
  } finally {
    await mongoose.connection.close(false);
  }
}

module.exports = {
  VALID_TIERS,
  CANONICAL_TIERS,
  TIER_RANK,
  parseArgs,
  findUser,
  loadSubscription,
  applyTier,
  runTierScript
};
