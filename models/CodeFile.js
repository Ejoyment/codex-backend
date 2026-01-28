const mongoose = require('mongoose');

const codeFileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true,
        lowercase: true
    },
    content: {
        type: String,
        default: ''
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeamProject'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    path: {
        type: String,
        default: '/'
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    collaborators: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        permission: {
            type: String,
            enum: ['read', 'write', 'admin'],
            default: 'read'
        }
    }],
    versions: [{
        content: String,
        modifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        modifiedAt: {
            type: Date,
            default: Date.now
        },
        comment: String
    }],
    tags: [String],
    size: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster queries
codeFileSchema.index({ company: 1, name: 1 });
codeFileSchema.index({ createdBy: 1 });
codeFileSchema.index({ language: 1 });

// Update size before saving
codeFileSchema.pre('save', function(next) {
    if (this.content) {
        this.size = Buffer.byteLength(this.content, 'utf8');
    }
    next();
});

module.exports = mongoose.model('CodeFile', codeFileSchema);
