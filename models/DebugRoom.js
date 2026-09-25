const mongoose = require('mongoose');

const debugRoomSchema = new mongoose.Schema({
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
    taskRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeamTask'
    },
    // Links to the host's sandbox directory used by terminalService and
    // gitService (same identifier convention as routes/terminal.js and
    // routes/debug.js — an opaque string, not a Mongo ref).
    workspaceId: {
        type: String,
        default: null
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['host', 'viewer', 'controller'],
            default: 'viewer'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Files open on the host's side when the room was created. These map
    // directly onto CollaborationService's per-file Y.Docs (fileId keys),
    // so joining a room just means joining these same `file:${fileId}` rooms.
    openFiles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CodeFile'
    }],
    // Pointer to the host's active terminal session in terminalService
    // (sessionId string, not a DB ref — terminals are in-memory).
    terminalSessionId: {
        type: String,
        default: null
    },
    // Last sequence number successfully mirrored, for resync bookkeeping.
    // The actual scrollback buffer lives in-memory in debugRoomSocket, not here.
    lastTerminalSeq: {
        type: Number,
        default: 0
    },
    // Pointer to a temporary, encrypted snapshot blob (stack trace, git
    // diff, redacted env). Never store the raw snapshot payload here.
    snapshotRef: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'closed'],
        default: 'pending',
        required: true
    },
    // Bumped on meaningful room activity (join, control change). Used by
    // debugRoomService's idle sweep to close rooms early even when they
    // haven't hit the hard TTL yet — the plan calls for "TTL plus an idle
    // timeout" and these are deliberately two separate mechanisms.
    lastActivityAt: {
        type: Date,
        default: Date.now
    },
    // TTL field — Mongo hard-deletes the document once this passes.
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

debugRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
debugRoomSchema.index({ host: 1, status: 1 });
debugRoomSchema.index({ company: 1 });

module.exports = mongoose.model('DebugRoom', debugRoomSchema);