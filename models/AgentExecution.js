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
    required: true,
  },
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
    enum: ['idle', 'running', 'awaiting_approval', 'completed', 'failed'],
    default: 'idle',
  },
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
