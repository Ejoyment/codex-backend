const mongoose = require('mongoose');

const teamConventionSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    category: {
        type: String,
        enum: ['architecture', 'naming', 'error-handling', 'state-management', 'api-design', 'testing', 'security', 'deployment', 'custom'],
        required: true
    },
    rule: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    examples: [{
        type: String
    }],
    techStack: [{
        type: String,
        enum: ['flutter', 'react', 'node', 'python', 'go', 'rust', 'general']
    }],
    priority: {
        type: String,
        enum: ['required', 'recommended', 'optional'],
        default: 'recommended'
    },
    tags: [String],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

teamConventionSchema.index({ companyId: 1, category: 1 });
teamConventionSchema.index({ companyId: 1, techStack: 1 });

module.exports = mongoose.model('TeamConvention', teamConventionSchema);
