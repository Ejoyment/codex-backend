const mongoose = require('mongoose');

const pipelineRunSchema = new mongoose.Schema({
    pipeline: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pipeline',
        required: true,
        index: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    triggeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'running', 'success', 'failed'],
        default: 'pending'
    },
    stageResults: [{
        name: { type: String },
        status: { type: String, enum: ['pending', 'running', 'success', 'failed'] },
        output: { type: String, default: '' }
    }],
    error: {
        type: String,
        default: ''
    },
    durationMs: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

pipelineRunSchema.index({ pipeline: 1, createdAt: -1 });
pipelineRunSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('PipelineRun', pipelineRunSchema);