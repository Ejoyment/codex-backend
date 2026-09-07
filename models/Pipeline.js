const mongoose = require('mongoose');

const pipelineSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    repo: {
        owner: { type: String, default: '' },
        repo: { type: String, default: '' },
        branch: { type: String, default: 'main' }
    },
    stages: [{
        name: { type: String, required: true },
        command: { type: String, required: true },
        icon: { type: String, default: '' }
    }],
    enabled: {
        type: Boolean,
        default: true
    },
    lastRun: {
        type: Date
    },
    lastStatus: {
        type: String,
        enum: ['success', 'failed', 'running', 'pending', '']
    }
}, {
    timestamps: true
});

pipelineSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Pipeline', pipelineSchema);