const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

const TIERS = {
  developer: {
    rank: 0, label: 'Developer', price: 0, family: 'modern',
    aiMsgs: 0, aiPair: false,
    credits: 0, hours: 0, jobs: 0, timeout: 5,
    rooms: 0, peers: 0, deployments: 1, spec: 'read_only',
    webrtc: false, retention: 7,
    members: 1, projects: 1, tasks: 5, storageMB: 50, integrations: 0, meetings: 0,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  freebie: {
    rank: 1, label: 'Freebie', price: 0, family: 'legacy',
    aiMsgs: 10, aiPair: false,
    credits: 0, hours: 0, jobs: 0, timeout: 5,
    rooms: 0, peers: 0, deployments: 1, spec: 'read_only',
    webrtc: false, retention: 7,
    members: 1, projects: 1, tasks: 5, storageMB: 50, integrations: 0, meetings: 0,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  starter: {
    rank: 2, label: 'Starter trial', price: 50, family: 'legacy',
    aiMsgs: 10, aiPair: false,
    credits: 0, hours: 0, jobs: 0, timeout: 5,
    rooms: 0, peers: 0, deployments: 1, spec: 'read_only',
    webrtc: false, retention: 7,
    members: 1, projects: 1, tasks: 5, storageMB: 50, integrations: 0, meetings: 0,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  pro: {
    rank: 3, label: 'Pro', price: 20, family: 'modern',
    aiMsgs: 100, aiPair: true,
    credits: 20, hours: 10, jobs: 1, timeout: 15,
    rooms: 1, peers: 2, deployments: 3, spec: 'full_sdd',
    webrtc: true, retention: 14,
    members: 10, projects: 50, tasks: 100, storageMB: 5000, integrations: 5, meetings: 100,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  team_standard: {
    rank: 4, label: 'Team Standard', price: 40, family: 'modern',
    aiMsgs: 100, aiPair: true,
    credits: 40, hours: 25, jobs: 2, timeout: 30,
    rooms: Infinity, peers: 4, deployments: 20, spec: 'team_library',
    webrtc: true, retention: 30,
    members: -1, projects: -1, tasks: -1, storageMB: -1, integrations: -1, meetings: -1,
    flags: { teamSpecLibrary: true, teamRBAC: true, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  pro_plus: {
    rank: 5, label: 'Pro+', price: 60, family: 'modern',
    aiMsgs: 100, aiPair: true,
    credits: 70, hours: 50, jobs: 3, timeout: 30,
    rooms: 3, peers: 4, deployments: 10, spec: 'realtime_drift',
    webrtc: true, retention: 30,
    members: 10, projects: 50, tasks: 100, storageMB: 5000, integrations: 5, meetings: 100,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  professional: {
    rank: 6, label: 'Professional', price: 99, family: 'legacy',
    aiMsgs: 100, aiPair: true,
    credits: 0, hours: 0, jobs: 0, timeout: 5,
    rooms: 0, peers: 0, deployments: 1, spec: 'read_only',
    webrtc: false, retention: 7,
    members: 10, projects: 50, tasks: 100, storageMB: 5000, integrations: 5, meetings: 100,
    flags: { teamSpecLibrary: false, teamRBAC: false, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  team_premium: {
    rank: 7, label: 'Team Premium', price: 120, family: 'modern',
    aiMsgs: 100, aiPair: true,
    credits: 200, hours: 120, jobs: 5, timeout: 60,
    rooms: Infinity, peers: 8, deployments: Infinity, spec: 'cross_repo',
    webrtc: true, retention: 90,
    members: -1, projects: -1, tasks: -1, storageMB: -1, integrations: -1, meetings: -1,
    flags: { teamSpecLibrary: true, teamRBAC: true, ssoAuthentication: false, auditLogs: false, scimProvisioning: false, dedicatedAccountManager: false, slaUptime: false }
  },
  enterprise: {
    rank: 8, label: 'Enterprise', price: 299, family: 'modern',
    aiMsgs: Infinity, aiPair: true,
    credits: null, hours: null, jobs: null, timeout: null,
    rooms: Infinity, peers: Infinity, deployments: Infinity, spec: 'custom',
    webrtc: true, retention: Infinity,
    members: -1, projects: -1, tasks: -1, storageMB: -1, integrations: -1, meetings: -1,
    flags: { teamSpecLibrary: true, teamRBAC: true, ssoAuthentication: true, auditLogs: true, scimProvisioning: true, dedicatedAccountManager: true, slaUptime: true }
  }
};

const VALID_TIERS = Object.keys(TIERS);
const MODERN_TIERS = VALID_TIERS.filter((t) => TIERS[t].family === 'modern');
const LEGACY_TIERS = VALID_TIERS.filter((t) => TIERS[t].family === 'legacy');

function fmt(v) {
  if (v === Infinity || v === -1) return 'unlimited';
  if (v === null || v === undefined) return 'custom';
  if (v === false) return 'off';
  if (v === true) return 'on';
  return String(v);
}

function restrictionLines(tier) {
  const t = TIERS[tier];
  return [
    `AI pair: ${t.aiPair ? 'enabled' : 'disabled'} · AI messages/day: ${fmt(t.aiMsgs)}`,
    `AI credits: ${fmt(t.credits)}/mo · Cloud compute: ${fmt(t.hours)} hrs/mo`,
    `Agent jobs: ${fmt(t.jobs)} concurrent · Task timeout: ${t.timeout === null ? 'custom' : `${t.timeout} min`}`,
    `Debug rooms: ${fmt(t.rooms)} (${fmt(t.peers)} peers) · Deployments: ${fmt(t.deployments)} · Spec engine: ${fmt(t.spec)}`,
    `WebRTC: ${fmt(t.webrtc)} · Data retention: ${t.retention === null ? 'custom' : t.retention === Infinity ? 'unlimited' : t.retention + ' days'}`,
    `Members: ${fmt(t.members)} · Projects: ${fmt(t.projects)} · Tasks/project: ${fmt(t.tasks)} · Storage: ${fmt(t.storageMB)} MB`,
    `Integrations: ${fmt(t.integrations)} · Meetings/mo: ${fmt(t.meetings)}`
  ];
}

function printRestrictions(tier) {
  const t = TIERS[tier];
  console.log(`  Restrictions for ${tier} (${t.label}, $${t.price}/mo):`);
  restrictionLines(tier).forEach((l) => console.log(`    ${l}`));
}

function printTierList() {
  console.log('Available tiers:\n');
  for (const tier of VALID_TIERS) {
    printRestrictions(tier);
    console.log('');
  }
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    force: false,
    help: false,
    list: false,
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
    else if (a === '--list') opts.list = true;
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

function applyStoredProfile(subscription, tier) {
  const t = TIERS[tier];
  if (t.flags) {
    for (const [key, value] of Object.entries(t.flags)) {
      subscription[key] = value;
    }
  }
  if (!subscription.creditPool) subscription.creditPool = {};
  if (!subscription.cloudComputeHours) subscription.cloudComputeHours = {};
  if (t.credits !== null) subscription.creditPool.monthlyLimit = t.credits;
  if (t.hours !== null) subscription.cloudComputeHours.monthlyLimit = t.hours;
  if (t.jobs !== null) subscription.maxConcurrentAgentJobs = t.jobs;
  if (t.timeout !== null) subscription.taskTimeoutMinutes = t.timeout;
  if (t.rooms !== null) subscription.maxDebugHostRooms = t.rooms;
  if (t.peers !== null) subscription.maxDebugParticipants = t.peers;
  if (t.deployments !== null) subscription.maxActiveDeployments = t.deployments;
  if (t.spec !== null) subscription.specEngineLevel = t.spec;
  if (t.webrtc !== null) subscription.webrtcVoiceEnabled = t.webrtc;
  if (t.retention !== null) subscription.dataRetentionDays = t.retention;
}

function directionAllowed(direction, currentTier, targetTier) {
  const current = TIERS[currentTier];
  const target = TIERS[targetTier];
  if (!current || !target) return false;
  if (direction === 'upgrade') {
    if (target.rank > current.rank) return true;
    return current.family === 'legacy' && target.family === 'modern' && targetTier !== 'developer';
  }
  if (target.rank < current.rank) return true;
  return current.family === 'modern' && target.family === 'legacy';
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

  if (subscription && TIERS[subscription.tier] && TIERS[subscription.tier].family === 'legacy' && TIERS[target].family === 'modern') {
    console.log(`  Note: migrating off legacy tier "${subscription.tier}" to the current lineup.`);
  }

  if (subscription && subscription.tier === target) {
    console.log(`\nAlready on "${target}" — nothing to do.`);
    printRestrictions(target);
    return { changed: false, created: false };
  }

  if (subscription && !force && !directionAllowed(direction, subscription.tier, target)) {
    throw new Error(
      `Refused: ${subscription.tier} -> ${target} is not a ${direction}. ` +
      `Use --force to set it anyway.`
    );
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
    applyStoredProfile(preview, target);
    printSnapshot('AFTER (would be):', snapshot(preview));
    console.log('');
    printRestrictions(target);
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
  applyStoredProfile(subscription, target);
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
  console.log('');
  printRestrictions(target);
  console.log(`\nDone. The change is read live from the DB — just refresh the app (no restart needed).`);
  return { changed: true, created: isNewRecord };
}

async function runTierScript({ direction, defaultTier, argv, usage }) {
  const opts = parseArgs(argv);
  if (opts.list) {
    printTierList();
    return { changed: false };
  }
  if (opts.help || (!opts.email && !opts.userId)) {
    console.log(usage);
    console.log(`Current pricing tiers: ${MODERN_TIERS.join(', ')}`);
    console.log(`Legacy tiers (still valid): ${LEGACY_TIERS.join(', ')}`);
    console.log(`Run with --list to see every tier's restrictions.`);
    process.exit(opts.help ? 0 : 1);
  }

  const tier = opts.tier || defaultTier;
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const user = await findUser(opts);
    const subscription = await loadSubscription(user);
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
  TIERS,
  VALID_TIERS,
  MODERN_TIERS,
  LEGACY_TIERS,
  parseArgs,
  findUser,
  loadSubscription,
  applyTier,
  runTierScript
};
