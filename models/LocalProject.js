const mongoose = require('mongoose');

const localProjectSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
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
        enum: ['active', 'planning', 'on-hold', 'completed', 'archived'],
        default: 'active'
    },
    // For local projects (not GitHub)
    isGitEnabled: {
        type: Boolean,
        default: false
    },
    // GitHub push tracking
    pushedToGitHub: {
        type: Boolean,
        default: false
    },
    githubRepoUrl: String,
    githubRepoName: String,
    // Workbench / VFS workspace ID if created in code editor
    workspaceId: String,
    // Project settings
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    tags: [String],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isArchived: {
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
localProjectSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
localProjectSchema.index({ userId: 1, status: 1 });
localProjectSchema.index({ userId: 1, isArchived: 1 });

module.exports = mongoose.model('LocalProject', localProjectSchema);