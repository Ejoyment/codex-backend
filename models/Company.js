const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        default: ''
    },
    logo: {
        type: String,
        default: ''
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['owner', 'admin', 'member', 'viewer'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    settings: {
        allowMemberInvites: {
            type: Boolean,
            default: false
        },
        requireApproval: {
            type: Boolean,
            default: true
        },
        defaultRole: {
            type: String,
            enum: ['member', 'viewer'],
            default: 'member'
        }
    },
    subscription: {
        tier: {
            type: String,
            enum: ['freebie', 'professional', 'enterprise'],
            default: 'freebie'
        },
        memberLimit: {
            type: Number,
            default: 1  // Freebie: 1 member only (owner)
        }
    },
    stats: {
        totalProjects: { type: Number, default: 0 },
        totalTasks: { type: Number, default: 0 },
        completedTasks: { type: Number, default: 0 },
        totalMeetings: { type: Number, default: 0 }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for faster queries
companySchema.index({ owner: 1 });
companySchema.index({ 'members.user': 1 });
companySchema.index({ slug: 1 });

module.exports = mongoose.model('Company', companySchema);
