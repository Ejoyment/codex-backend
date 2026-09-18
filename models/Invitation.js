const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        enum: ['member', 'admin', 'viewer'],
        default: 'member'
    },
    token: {
        type: String,
        unique: true,
        required: true,
        default: function() {
            return crypto.randomBytes(32).toString('hex');
        }
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'expired'],
        default: 'pending'
    },
    expiresAt: {
        type: Date,
        required: true,
        default: function() {
            // Default expiry: 7 days
            return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
    },
    acceptedAt: Date,
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    message: String,
    metadata: {
        sentCount: {
            type: Number,
            default: 1
        },
        lastSentAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Index for faster queries
invitationSchema.index({ email: 1, company: 1 });

invitationSchema.index({ status: 1 });
invitationSchema.index({ expiresAt: 1 });

// Check if invitation is expired
invitationSchema.methods.isExpired = function() {
    return this.expiresAt < new Date() || this.status === 'expired';
};

// Mark as expired
invitationSchema.methods.markExpired = function() {
    this.status = 'expired';
    return this.save();
};

module.exports = mongoose.model('Invitation', invitationSchema);
