const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeamProject',
        required: true
    },
    subdomain: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    containerId: {
        type: String,
        default: null
    },
    runtime: {
        type: String,
        enum: ['node', 'python', 'static', 'docker', 'unknown'],
        default: 'unknown'
    },
    status: {
        type: String,
        enum: ['pending', 'building', 'deploying', 'success', 'failed', 'stopped'],
        default: 'pending'
    },
    errorMessage: {
        type: String,
        default: null
    },
    deployedUrl: {
        type: String,
        default: null
    },
    buildLogs: {
        type: String,
        default: ''
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ subdomain: 1 }, { unique: true });

module.exports = mongoose.model('Deployment', deploymentSchema);