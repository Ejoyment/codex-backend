const mongoose = require('mongoose');

const localTaskSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LocalProject',
        default: null
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'in_review', 'completed', 'archived'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Task types: local or linked to GitHub issue
    taskType: {
        type: String,
        enum: ['local', 'github', 'gitlab'],
        default: 'local'
    },
    // GitHub issue link (if taskType === 'github')
    githubIssueUrl: String,
    githubIssueNumber: Number,
    githubRepoName: String,
    // Assignee
    assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assigneeName: String,
    labels: [String],
    dueDate: Date,
    completedAt: Date,
    // For local tasks with Git
    isPushedToGit: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
localTaskSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
localTaskSchema.index({ userId: 1, status: 1 });
localTaskSchema.index({ userId: 1, completedAt: 1 });
localTaskSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('LocalTask', localTaskSchema);