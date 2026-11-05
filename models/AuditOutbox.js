const mongoose = require('mongoose');

const auditOutboxSchema = new mongoose.Schema({
  payload: {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    email: { type: String, default: '' },
    event: { type: String, required: true },
    category: { type: String, default: 'system' },
    target: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'failed'],
    default: 'pending',
  },
  availableAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
  lockedUntil: Date,
  lockToken: String,
  lastError: { type: String, default: '' },
}, { timestamps: true });

auditOutboxSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
auditOutboxSchema.index({ status: 1, lockedUntil: 1 });

module.exports = mongoose.model('AuditOutbox', auditOutboxSchema);
