const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    otp: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: parseInt(process.env.OTP_EXPIRY_MINUTES || 10) * 60 // Auto-delete after expiry
    },
    attempts: {
        type: Number,
        default: 0
    },
    verified: {
        type: Boolean,
        default: false
    }
});

// Index for faster queries
otpSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model('OTP', otpSchema);
