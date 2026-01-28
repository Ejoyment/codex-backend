const mongoose = require('mongoose');

const meetingRoomSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: String,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    scheduledAt: {
        type: Date,
        required: true
    },
    duration: {
        type: Number,
        default: 60
    },
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['invited', 'accepted', 'declined', 'joined', 'left'],
            default: 'invited'
        },
        joinedAt: Date,
        leftAt: Date
    }],
    roomId: {
        type: String,
        unique: true,
        required: true
    },
    password: String,
    settings: {
        videoEnabled: {
            type: Boolean,
            default: true
        },
        audioEnabled: {
            type: Boolean,
            default: true
        },
        screenShareEnabled: {
            type: Boolean,
            default: true
        },
        recordingEnabled: {
            type: Boolean,
            default: false
        },
        waitingRoom: {
            type: Boolean,
            default: false
        },
        maxParticipants: {
            type: Number,
            default: 100
        }
    },
    recording: {
        url: String,
        startedAt: Date,
        endedAt: Date,
        size: Number
    },
    transcript: String,
    notes: String,
    startedAt: Date,
    endedAt: Date
}, {
    timestamps: true
});

meetingRoomSchema.index({ company: 1, scheduledAt: 1 });
meetingRoomSchema.index({ roomId: 1 });
meetingRoomSchema.index({ host: 1 });

module.exports = mongoose.model('MeetingRoom', meetingRoomSchema);
