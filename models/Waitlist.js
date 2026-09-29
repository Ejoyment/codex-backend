const mongoose = require('mongoose');

/**
 * Waitlist signup entry.
 * One document per email address (unique index) so the public counter
 * is a cheap countDocuments() and release blasts can dedupe naturally.
 */
const waitlistSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 254
    },
    status: {
        type: String,
        enum: ['subscribed', 'released', 'unsubscribed'],
        default: 'subscribed'
    },
    source: {
        type: String,
        default: 'landing-page',
        maxlength: 64
    },
    name: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    welcomeSentAt: {
        type: Date,
        default: null
    },
    releaseSentAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

waitlistSchema.index({ subscribedAt: 1 });
waitlistSchema.index({ status: 1, releaseSentAt: 1 });

module.exports = mongoose.model('Waitlist', waitlistSchema);
