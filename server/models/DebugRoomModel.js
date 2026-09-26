const mongoose = require('mongoose');

// Phase 3 — Ephemeral Debug Rooms.
// Guests are read-only by default; controller rights are granted explicitly
// by the host and instantly revocable. Snapshot data is wiped on close/TTL.

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['host', 'viewer', 'controller'],
      default: 'viewer',
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const debugRoomSchema = new mongoose.Schema(
  {
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    workspaceId: { type: String, default: null },
    taskRef: { type: String, default: null },
    participants: { type: [participantSchema], default: [] },
    // Pending join requests awaiting host consent
    pendingRequests: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            requestedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    snapshotRef: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'active', 'closed'],
      default: 'pending',
    },
    // Per-variable env shares the host explicitly approved (never inherited)
    sharedEnvKeys: { type: [String], default: [] },
    // Sequenced terminal relay state (host-owned ordered stream)
    terminalSeq: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL index — MongoDB deletes the document once expiresAt passes.
debugRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
debugRoomSchema.index({ hostId: 1, status: 1 });
debugRoomSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('DebugRoom', debugRoomSchema);
