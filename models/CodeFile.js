const crypto = require('crypto');
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
        ref: 'LocalProject'
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
    // 'base64' marks binary content (images, fonts, archives). Deployment
    // decodes it before writing the file; text files leave this unset.
    encoding: {
        type: String,
        enum: ['base64'],
        default: undefined
    },
    // True when the file exists in the project but its bytes were too large
    // for a MongoDB document and were intentionally not stored. Deployment
    // resolves the content from the source repository.
    contentOmitted: {
        type: Boolean,
        default: false
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

function normalizePath(value) {
    let path = String(value || '/').replace(/\\/g, '/').trim();
    if (!path) return '/';
    if (!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
}

function fullPathFor(file) {
    const path = normalizePath(file?.path);
    const name = String(file?.name || '').trim();
    if (!name) return path;
    if (path === '/') return `/${name}`;
    if (path === name || path.endsWith(`/${name}`)) return path;
    return `${path}/${name}`;
}

function pathKeyFor(file) {
    if (!file?.company || !file?.name) return undefined;
    return crypto
        .createHash('sha256')
        .update(`${file.company}:${fullPathFor(file)}`)
        .digest('hex');
}

// A file's identity is its full path within a workspace. Storing a hash keeps
// the unique index small even when paths are long, while the pre-validate hook
// normalizes both supported shapes (`/src` + `app.js` and `/src/app.js`).
codeFileSchema.add({
    pathKey: {
        type: String,
        index: true,
        unique: true,
        sparse: true,
        select: false,
    },
});

codeFileSchema.pre('validate', function(next) {
    this.name = String(this.name || '').trim();
    this.path = normalizePath(this.path);
    const key = pathKeyFor(this);
    if (key) this.pathKey = key;
    next();
});

codeFileSchema.statics.fullPathFor = fullPathFor;
codeFileSchema.statics.pathKeyFor = pathKeyFor;

// Index for faster queries
codeFileSchema.index({ company: 1, name: 1 });
codeFileSchema.index({ createdBy: 1 });
codeFileSchema.index({ language: 1 });
// Compound indexes for the file list endpoint: filter by company/project,
// sort by updatedAt descending. Without these, large collections exceed
// MongoDB's 32MB in-memory sort limit.
codeFileSchema.index({ company: 1, updatedAt: -1 });
codeFileSchema.index({ project: 1, updatedAt: -1 });
codeFileSchema.index({ updatedAt: -1 });

// Update size before saving
codeFileSchema.pre('save', function(next) {
    if (this.content) {
        this.size = this.encoding === 'base64'
            ? Buffer.byteLength(this.content, 'base64')
            : Buffer.byteLength(this.content, 'utf8');
    }
    next();
});

// Auto-index file content into vector memory on save (debounced)
const _indexTimers = new Map();
codeFileSchema.post('save', function(doc) {
    if (!doc.content || doc.content.length < 10) return;
    // Binary payloads are base64 text and omitted files have no content;
    // indexing either would pollute vector memory with unusable data.
    if (doc.encoding === 'base64' || doc.contentOmitted) return;

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
