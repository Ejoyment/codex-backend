const mongoose = require('mongoose');

/**
 * A frame read from the user's own signed-in Figma tab by the Buildrs Figma
 * Helper. The helper has the same access as the person using Figma, so a
 * snapshot works even when the OAuth token has no file scope — or when there
 * is no OAuth connection at all.
 *
 * Snapshots are a cache: they are replaced whenever the frame is opened again
 * and expire after 30 days.
 */
const figmaDesignSnapshotSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    fileKey: {
        type: String,
        required: true,
    },
    nodeId: {
        type: String,
        required: true,
    },
    fileName: {
        type: String,
        default: null,
    },
    nodeName: {
        type: String,
        default: null,
    },
    source: {
        type: String,
        default: 'helper',
    },
    // Trimmed Figma node tree (whitelisted fields, capped depth/children).
    document: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    // Pre-rendered layer spec for AI codegen.
    designSpec: {
        type: String,
        default: null,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
}, { minimize: false });

figmaDesignSnapshotSchema.index({ userId: 1, fileKey: 1, nodeId: 1 }, { unique: true });
figmaDesignSnapshotSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('FigmaDesignSnapshot', figmaDesignSnapshotSchema);
