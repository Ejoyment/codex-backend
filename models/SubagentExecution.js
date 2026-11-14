const mongoose = require('mongoose');

const subagentExecutionSchema = new mongoose.Schema({
  parentExecutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AgentExecution',
    required: true,
    index: true,
  },
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
  role: {
    type: String,
    enum: ['researcher', 'coder', 'reviewer', 'tester'],
    required: true,
  },
  status: {
    type: String,
    enum: ['idle', 'running', 'complete', 'failed'],
    default: 'idle',
  },
  instruction: {
    type: String,
    required: true,
  },
  output: { type: String, default: '' },
  error: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  logs: [{ timestamp: Date, message: String }],
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

subagentExecutionSchema.index({ parentExecutionId: 1, status: 1 });
subagentExecutionSchema.index({ userId: 1, createdAt: -1 });
subagentExecutionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SubagentExecution', subagentExecutionSchema);
