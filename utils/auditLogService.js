const AuditLog = require('../models/AuditLog');
const AuditOutbox = require('../models/AuditOutbox');

function normalizePayload({ companyId, actorId, email, event, category = 'system', target = '', details = {}, req }) {
    return {
        companyId,
        actorId: actorId || null,
        email: email || '',
        event,
        category,
        target: target || '',
        details: details || {},
        ip: req ? (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() : '',
    };
}

async function writeAuditLog(payload, sourceId = null) {
    return AuditLog.create({
        company: payload.companyId,
        actor: payload.actorId || undefined,
        email: payload.email,
        event: payload.event,
        category: payload.category,
        target: payload.target,
        details: payload.details,
        ip: payload.ip,
        ...(sourceId ? { sourceId } : {}),
    });
}

/**
 * Write an audit event. If the direct write fails (transient DB error, index
 * rebuild, replica failover), the event is queued for the outbox worker
 * instead of being silently lost.
 */
async function addAuditLog(args) {
    if (!args?.companyId) return null;
    const payload = normalizePayload(args);
    try {
        return await writeAuditLog(payload);
    } catch (error) {
        console.error('Audit log write failed, queueing for retry:', error.message);
        try {
            return await AuditOutbox.create({ payload, lastError: error.message });
        } catch (queueError) {
            console.error('Audit log outbox enqueue failed:', queueError.message);
            return null;
        }
    }
}

module.exports = { addAuditLog, writeAuditLog, normalizePayload };
