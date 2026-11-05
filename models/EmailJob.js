const mongoose = require('mongoose');

const emailJobSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['invitation', 'trial_welcome'],
    required: true,
  },
  dedupeKey: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed'],
    default: 'pending',
  },
  availableAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
  lockedUntil: Date,
  lockToken: String,
  sentAt: Date,
  lastError: String,
}, { timestamps: true });

emailJobSchema.index({ dedupeKey: 1 }, { unique: true });
emailJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
emailJobSchema.index({ status: 1, lockedUntil: 1 });

module.exports = mongoose.model('EmailJob', emailJobSchema);
