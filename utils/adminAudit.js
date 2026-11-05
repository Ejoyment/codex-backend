const crypto = require('crypto');
const mongoose = require('mongoose');
const AdminAudit = require('../models/AdminAudit');

function adminKeyFingerprint(req) {
  const key = String(req?.headers?.['x-admin-key'] || '');
  if (!key) return '';
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function requestIp(req) {
  if (!req) return '';
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();
}

/**
 * Durable audit trail for static-admin-key actions. The structured stdout line
 * is always emitted (so the runbook works even if Mongo is unavailable); the
 * AdminAudit row is best-effort and never throws into the admin operation.
 */
async function recordAdminAction({ action, target = '', details = {}, req } = {}) {
  const entry = {
    action,
    target: target ? String(target) : '',
    adminKeyFingerprint: adminKeyFingerprint(req),
    details: details || {},
    ip: requestIp(req),
  };

  console.log(`[admin-audit] ${JSON.stringify(entry)}`);

  if (mongoose.connection.readyState !== 1) return null;
  try {
    return await AdminAudit.create(entry);
  } catch (error) {
    console.error(`[admin-audit] persist failed: ${error.message}`);
    return null;
  }
}

module.exports = {
  recordAdminAction,
  adminKeyFingerprint,
};
