const mongoose = require('mongoose');

const adminAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    target: { type: String, default: '', index: true },
    adminKeyFingerprint: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    expiresAt: {
      type: Date,
      default: () => new Date(
        Date.now() + (parseInt(process.env.ADMIN_AUDIT_RETENTION_DAYS || '365', 10) * 24 * 60 * 60 * 1000)
      ),
    },
  },
  { timestamps: true }
);

adminAuditSchema.index({ createdAt: -1 });
adminAuditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AdminAudit', adminAuditSchema);
