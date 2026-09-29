const mongoose = require('mongoose');

const specSchema = new mongoose.Schema({
  // Specs are a project-level construct. A spec always belongs to a project.
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LocalProject',
    required: true,
  },
  // Optional collaboration context: the workspace the project belongs to.
  // Solo projects have no workspace, so this stays null.
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: { type: String, default: '' },
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
  architecturalRules: [{ type: String }],
  requirements: [{
    id: { type: String, required: true },
    text: { type: String, required: true },
    checkType: { type: String, enum: ['code_pattern', 'test_name', 'file_exists', 'ai_review', 'manual'], default: 'manual' },
    checkConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    severity: { type: String, enum: ['blocking', 'warning'], default: 'blocking' },
    status: { type: String, enum: ['pass', 'pending', 'fail', 'unknown'], default: 'pending' },
    evidence: { type: String, default: null },
  }],
  forbiddenImports: [{ type: String }],
  constraints: [{ key: String, value: String }],
  verificationCommand: { type: String, default: '' },
  coverageThreshold: { type: Number, default: null },
  status: { type: String, enum: ['unvalidated', 'healthy', 'warning', 'failing', 'drifted'], default: 'unvalidated' },
  lastValidatedAt: { type: Date, default: null },
  lastValidationResult: { type: mongoose.Schema.Types.Mixed, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

specSchema.index({ projectId: 1, specId: 1 });
specSchema.index({ projectId: 1, title: 1 });
specSchema.index({ workspaceId: 1, specId: 1 });
specSchema.index({ specId: 1 });

module.exports = mongoose.model('Spec', specSchema);
