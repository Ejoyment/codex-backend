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
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    // Which rail created this row. Older rows predate this field; the reaper
    // infers their provider from the stored reference before falling back to
    // Stripe.
    provider: {
        type: String,
        enum: ['stripe', 'paystack', 'flutterwave']
    },
    idempotencyKey: String,
    stripePaymentIntentId: String,
    // These were written by the provider schedulers but never declared, so
    // Mongoose strict mode silently dropped them. The reaper needs them to
    // verify a stuck charge against the provider.
    paystackReference: String,
    flutterwaveTransactionId: String,
    // Last status returned by the provider during reconciliation.
    providerStatus: String,
    reconciledAt: Date,
    attempts: {
        type: Number,
        default: 0
    },
    lastAttempt: Date,
    error: String,
    completedAt: Date,
    // Cancel timestamp (previously written schema-less as `canceledAt` and
    // silently dropped by strict mode — see paystackScheduler).
    cancelledAt: Date
}, {
    timestamps: true
});

// Index for efficient querying of pending charges
billingScheduleSchema.index({ scheduledFor: 1, status: 1 });
billingScheduleSchema.index({ userId: 1, status: 1 });
billingScheduleSchema.index({ status: 1, lastAttempt: 1 });
billingScheduleSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('BillingSchedule', billingScheduleSchema);
