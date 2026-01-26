const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['standup', 'planning', 'review', 'retrospective', 'general'],
        default: 'general'
    },
    description: {
        type: String,
        default: ''
    },
    organizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['invited', 'accepted', 'declined', 'attended'],
            default: 'invited'
        },
        joinedAt: Date,
        leftAt: Date
    }],
    scheduledAt: {
        type: Date,
        required: true
    },
    duration: {
        type: Number, // in minutes
        default: 30
    },
    status: {
        type: String,
        enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    meetingLink: String,
    roomId: String,
    agenda: [{
        topic: String,
        duration: Number,
        presenter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    notes: {
        type: String,
        default: ''
    },
    actionItems: [{
        task: String,
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        dueDate: Date,
        completed: {
            type: Boolean,
            default: false
        }
    }],
    recording: {
        url: String,
        duration: Number,
        size: Number
    },
    aiSummary: {
        summary: String,
        keyPoints: [String],
        decisions: [String],
        generatedAt: Date
    },
    startedAt: Date,
    endedAt: Date
}, {
    timestamps: true
});

meetingSchema.index({ company: 1, scheduledAt: -1 });
meetingSchema.index({ organizer: 1 });
meetingSchema.index({ 'participants.user': 1 });

module.exports = mongoose.model('Meeting', meetingSchema);
