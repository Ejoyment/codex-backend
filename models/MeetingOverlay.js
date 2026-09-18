const mongoose = require('mongoose');

const meetingOverlaySchema = new mongoose.Schema({
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MeetingRoom',
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    hostUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    context: {
        type: {
            type: String,
            enum: ['editor', 'sandbox', 'design-review', 'debug', 'general'],
            default: 'general'
        },
        targetFileId: String,
        targetProjectId: String,
        ticketId: String,
        debugSessionId: String
    },
    access: {
        mode: {
            type: String,
            enum: ['public', 'company', 'invited'],
            default: 'company'
        },
        invitedUserIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        joinToken: {
            type: String,
            unique: true,
            sparse: true
        }
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'ended'],
        default: 'active'
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    endedAt: Date,
    metadata: {
        maxParticipants: { type: Number, default: 12 },
        source: { type: String, default: 'manual' }
    }
}, {
    timestamps: true
});

meetingOverlaySchema.index({ meetingId: 1, status: 1 });
meetingOverlaySchema.index({ companyId: 1, status: 1 });
meetingOverlaySchema.index({ 'access.joinToken': 1 });

module.exports = mongoose.model('MeetingOverlay', meetingOverlaySchema);
