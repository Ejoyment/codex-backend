const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    guestName: {
        type: String,
        default: 'Guest'
    },
    guestEmail: {
        type: String,
        default: null
    },
    subject: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    messages: [{
        sender: {
            type: String,
            enum: ['user', 'agent'],
            required: true
        },
        senderName: String,
        message: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        read: {
            type: Boolean,
            default: false
        }
    }],
    tags: [String],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    resolvedAt: Date,
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    feedback: String
});

// Update timestamp on save
supportTicketSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Generate ticket ID
supportTicketSchema.pre('save', function(next) {
    if (!this.ticketId) {
        this.ticketId = 'TKT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
    next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
