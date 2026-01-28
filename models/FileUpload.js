const mongoose = require('mongoose');

const fileUploadSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    folder: {
        type: String,
        default: '/'
    },
    tags: [String],
    description: String,
    isPublic: {
        type: Boolean,
        default: false
    },
    sharedWith: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view'
        }
    }],
    versions: [{
        url: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    downloads: {
        type: Number,
        default: 0
    },
    lastAccessedAt: Date
}, {
    timestamps: true
});

fileUploadSchema.index({ company: 1, folder: 1 });
fileUploadSchema.index({ uploadedBy: 1 });
fileUploadSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('FileUpload', fileUploadSchema);
