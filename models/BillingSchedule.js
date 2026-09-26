const mongoose = require('mongoose');

const billingScheduleSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },
    chargeType: {
        type: String,
        enum: ['first_charge', 'second_charge', 'recurring'],
        required: true
    },
    scheduledFor: {
        type: Date,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'canceled'],
        default: 'pending'
    },
    stripePaymentIntentId: String,
    attempts: {
        type: Number,
        default: 0
    },
    lastAttempt: Date,
    error: String,
    completedAt: Date
}, {
    timestamps: true
});

// Index for efficient querying of pending charges
billingScheduleSchema.index({ scheduledFor: 1, status: 1 });
billingScheduleSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('BillingSchedule', billingScheduleSchema);
