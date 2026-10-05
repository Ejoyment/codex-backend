const mongoose = require('mongoose');

// Realtime collaboration session used by the multiplayer overlay (editor / sandbox /
// design-review / bug-handoff). Tracks presence, hover-cursor state, inline audio
// channels and typing indicators for everyone joined to the same context.
const collaborationSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['editor', 'sandbox', 'design', 'handoff', 'meeting'],
        default: 'editor'
    },
    // Free-form reference to the underlying context (fileId, projectId, overlayId, handoffId)
    contextRef: { type: String, default: null, index: true },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        color: String,
        joinedAt: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        audioOn: { type: Boolean, default: false },
        videoOn: { type: Boolean, default: false },
        typing: { type: Boolean, default: false },
        cursor: {
            x: Number,
            y: Number,
            line: Number,
            ch: Number
        }
    }],
    // Inline audio mesh channel id (used by the WebRTC signaling namespace)
    audioChannelId: { type: String, default: null },
    status: {
        type: String,
        enum: ['active', 'ended'],
        default: 'active'
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    // Retention: presence sessions are ephemeral (default 7d). Active editors
    // refresh lastSeen, not expiresAt — a session idle past its TTL is gone.
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (parseInt(process.env.COLLAB_SESSION_TTL_DAYS || '7', 10) * 24 * 60 * 60 * 1000))
    }
}, {
    timestamps: true
});

collaborationSessionSchema.index({ type: 1, status: 1 });
// TTL: rows die when expiresAt passes.
collaborationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CollaborationSession', collaborationSessionSchema);
