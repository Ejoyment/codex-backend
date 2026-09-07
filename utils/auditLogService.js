const AuditLog = require('../models/AuditLog');

async function addAuditLog({ companyId, actorId, email, event, category = 'system', target = '', details = {}, req }) {
    if (!companyId) return null;
    try {
        const entry = await AuditLog.create({
            company: companyId,
            actor: actorId || undefined,
            email: email || '',
            event,
            category,
            target: target || '',
            details: details || {},
            ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() : ''
        });
        return entry;
    } catch (error) {
        console.error('Audit log write failed:', error.message);
        return null;
    }
}

module.exports = { addAuditLog };