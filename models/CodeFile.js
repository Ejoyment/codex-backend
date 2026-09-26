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
    },
    ydocState: {
        type: Buffer,
        default: null
    },
    activeCollaborators: [{
        userId: mongoose.Schema.Types.ObjectId,
        socketId: String,
        cursor: {
            line: Number,
            column: Number
        },
        lastSeen: Date
    }]
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

// Auto-index file content into vector memory on save (debounced)
const _indexTimers = new Map();
codeFileSchema.post('save', function(doc) {
    if (!doc.content || doc.content.length < 10) return;

    // Debounce: cancel previous timer for this file
    if (_indexTimers.has(doc._id.toString())) {
        clearTimeout(_indexTimers.get(doc._id.toString()));
    }

    _indexTimers.set(doc._id.toString(), setTimeout(async () => {
        _indexTimers.delete(doc._id.toString());
        try {
            const vectorMemory = require('../utils/vectorMemory');
            await vectorMemory.store(
                doc.content,
                {
                    fileId: doc._id.toString(),
                    fileName: doc.name,
                    language: doc.language,
                    path: doc.path,
                    companyId: doc.company?.toString(),
                    type: 'codebase_file'
                },
                doc.createdBy?.toString(),
                doc.company?.toString()
            );
        } catch (err) {
            // Non-critical — log but don't block the save
            console.warn('Auto-index failed for', doc.name, err.message);
        }
    }, 5000)); // 5-second debounce
});

module.exports = mongoose.model('CodeFile', codeFileSchema);
