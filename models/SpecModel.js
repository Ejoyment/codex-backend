const mongoose = require('mongoose');

const specSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  specId: {
    type: String,
    required: true,
    default: () => `SPEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  },
  content: {
    type: String,
    required: true,
  },
  targetModules: [{ type: String }],
  targetFiles: [{ type: String }],
  assertions: [{
    rule: { type: String, required: true },
    target: { type: String, required: true },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

specSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

specSchema.index({ workspaceId: 1, specId: 1 });
specSchema.index({ workspaceId: 1, title: 1 });
specSchema.index({ specId: 1 });

module.exports = mongoose.model('Spec', specSchema);
