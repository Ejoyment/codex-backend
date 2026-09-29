const mongoose = require('mongoose');

const agentExecutionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIPairSession',
    default: null,
  },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalTask', default: null },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalProject', default: null },
  taskTitle: {
    type: String,
    required: true,
  },
  summary: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['queued', 'idle', 'running', 'awaiting_review', 'awaiting_approval', 'approved', 'rejected', 'completed', 'failed'],
    default: 'idle',
  },
  model: { type: String, default: '' },
  branch: { type: String, default: '' },
  baseBranch: { type: String, default: 'main' },
  contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  plan: { type: String, default: '' },
  terminalLog: [{ timestamp: Date, type: { type: String }, message: String, metadata: mongoose.Schema.Types.Mixed }],
  filesChanged: [{ path: String, action: String, diff: String }],
  validationResult: { type: mongoose.Schema.Types.Mixed, default: null },
  tweaks: [{ instruction: String, addedAt: Date, resultingDiff: String }],
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  retryCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  approvalRequired: {
    type: Boolean,
    default: false,
  },
  iterations: {
    type: Number,
    default: 0,
  },
  diffSummary: {
    filesChanged: { type: Number, default: 0 },
    insertions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

agentExecutionSchema.index({ userId: 1, sessionId: 1, status: 1 });
agentExecutionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AgentExecution', agentExecutionSchema);
