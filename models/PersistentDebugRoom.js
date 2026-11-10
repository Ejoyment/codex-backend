const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        default: 'Teammate'
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        default: null
    },
    role: {
        type: String,
        enum: ['host', 'collaborator', 'viewer'],
        default: 'viewer'
    },
    // Line the participant is currently looking at. Rendered as an inline
    // cursor chip in the shared code viewer.
    activeLine: {
        type: Number,
        default: 0
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const inviteSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['viewer', 'collaborator'],
        default: 'viewer'
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'revoked'],
        default: 'pending'
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    invitedAt: {
        type: Date,
        default: Date.now
    }
});

const chatMessageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    name: {
        type: String,
        default: 'Teammate'
    },
    role: {
        type: String,
        enum: ['host', 'collaborator', 'viewer', 'ai'],
        default: 'viewer'
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const activitySchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    actorName: {
        type: String,
        default: 'Teammate'
    },
    action: {
        type: String,
        required: true
    },
    target: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const linkSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    status: { type: String, default: '' },
    href: { type: String, default: '' }
}, { _id: false });

const investigationSchema = new mongoose.Schema({
    problem: { type: String, default: '' },
    reproduction: { type: String, default: '' },
    workingTheory: { type: String, default: '' },
    nextStep: { type: String, default: '' }
}, { _id: false });

const sharedContextSchema = new mongoose.Schema({
    task: { type: linkSchema, default: () => ({}) },
    pullRequest: { type: linkSchema, default: () => ({}) },
    branch: { type: linkSchema, default: () => ({}) },
    specification: { type: linkSchema, default: () => ({}) }
}, { _id: false });

// A persistent, shared debugging session. Unlike CollaborationSession
// (presence/typing only, ephemeral) this stores the context the team agrees on:
// branch + file, investigation notes, participants, invites, chat and activity.
const debugRoomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },
    description: {
        type: String,
        default: '',
        trim: true,
        maxlength: 2000
    },
    repository: {
        type: String,
        default: '',
        trim: true,
        maxlength: 200
    },
    branch: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    openFile: {
        type: String,
        default: '',
        trim: true,
        maxlength: 500
    },
    activeLine: {
        type: Number,
        default: 0,
        min: 0
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
        index: true
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    participants: [participantSchema],
    invites: [inviteSchema],
    investigation: {
        type: investigationSchema,
        default: () => ({})
    },
    context: {
        type: sharedContextSchema,
        default: () => ({})
    },
    chat: [chatMessageSchema],
    activity: [activitySchema],
    status: {
        type: String,
        enum: ['active', 'ended'],
        default: 'active',
        index: true
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Room list: most recently active rooms for a workspace or owner.
debugRoomSchema.index({ companyId: 1, status: 1, lastActiveAt: -1 });
debugRoomSchema.index({ createdBy: 1, lastActiveAt: -1 });
debugRoomSchema.index({ 'participants.userId': 1, lastActiveAt: -1 });
debugRoomSchema.index({ 'invites.email': 1 });

// The Phase 3 ephemeral rooms already register the `DebugRoom` model (see
// server/models/DebugRoomModel.js). Use a distinct name so both models can be
// loaded in the same process without Mongoose's OverwriteModelError.
module.exports = mongoose.model('PersistentDebugRoom', debugRoomSchema);
