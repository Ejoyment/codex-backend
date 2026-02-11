const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const supportAgentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['agent', 'supervisor', 'admin'],
        default: 'agent'
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'away', 'busy'],
        default: 'offline'
    },
    avatar: String,
    activeTickets: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SupportTicket'
    }],
    resolvedTickets: {
        type: Number,
        default: 0
    },
    averageRating: {
        type: Number,
        default: 0
    },
    lastActive: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
supportAgentSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password method
supportAgentSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('SupportAgent', supportAgentSchema);
