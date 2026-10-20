const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// A charge row left in `processing` longer than this crashed (or lost its
// worker) between the atomic claim and the completion write. The reaper
// reconciles those rows against Stripe instead of blindly retrying them.
const STUCK_PROCESSING_MS = parseInt(process.env.BILLING_STUCK_PROCESSING_MS, 10) || 30 * 60 * 1000;
const STUCK_REAP_BATCH = parseInt(process.env.BILLING_STUCK_REAP_BATCH, 10) || 100;
const STRIPE_PENDING_STATUSES = new Set([
    'processing',
    'requires_action',
    'requires_confirmation',
    'requires_capture'
]);

class BillingScheduler {
    /**
     * Schedule first charge (210 seconds after card entry)
     */
    static async scheduleFirstCharge(userId, subscriptionId, cardAddedAt) {
        const firstChargeTime = new Date(cardAddedAt.getTime() + (210 * 1000)); // 210 seconds
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            chargeType: 'first_charge',
            scheduledFor: firstChargeTime,
            amount: 2500, // $25.00 in cents
            status: 'pending'
        });
        
        await schedule.save();
        console.log(`First charge scheduled for user ${userId} at ${firstChargeTime}`);
        
        return schedule;
    }

    /**
     * Schedule second charge (2 months after first charge)
     */
    static async scheduleSecondCharge(userId, subscriptionId, firstChargeDate) {
        const secondChargeTime = new Date(firstChargeDate);
        secondChargeTime.setMonth(secondChargeTime.getMonth() + 2);
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            chargeType: 'second_charge',
            scheduledFor: secondChargeTime,
            amount: 2500,
            status: 'pending'
        });
        
        await schedule.save();
        console.log(`Second charge scheduled for user ${userId} at ${secondChargeTime}`);
        
        return schedule;
    }

    /**
     * Schedule recurring monthly charge
     */
    static async scheduleRecurringCharge(userId, subscriptionId, lastChargeDate) {
        const nextChargeTime = new Date(lastChargeDate);
        nextChargeTime.setMonth(nextChargeTime.getMonth() + 1);
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            chargeType: 'recurring',
            scheduledFor: nextChargeTime,
            amount: 2500,
            status: 'pending'
        });
        
        await schedule.save();
        console.log(`Recurring charge scheduled for user ${userId} at ${nextChargeTime}`);
        
        return schedule;
    }

    /**
     * Process a scheduled charge
     */
    static async processCharge(scheduleId) {
        // Atomic claim: two ticks (or two instances) racing the same pending
        // row must not both charge the provider. Loser sees non-pending and
        // stands down. Stuck `processing` rows are never auto-reclaimed here —
        // reapStuckCharges() reconciles them against Stripe first, because a
        // blind retry could double-charge if the first attempt went through.
        const schedule = await BillingSchedule.findOneAndUpdate(
            { _id: scheduleId, status: 'pending' },
            { status: 'processing', $inc: { attempts: 1 }, $set: { lastAttempt: new Date() } },
            { new: true }
        );

        if (!schedule) {
            console.log(`Schedule ${scheduleId} not found or not pending`);
            return { success: false, message: 'Schedule not found or not pending' };
        }

        try {
            const subscription = await Subscription.findById(schedule.subscriptionId);
            const user = await User.findById(schedule.userId);

            if (!subscription || !user) {
                throw new Error('Subscription or user not found');
            }

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: schedule.amount,
                currency: 'usd',
                customer: subscription.customerId,
                payment_method: subscription.paymentId,
                off_session: true,
                confirm: true,
                description: `BuildrsHQ ${schedule.chargeType.replace('_', ' ')} - ${user.email}`,
                metadata: {
                    userId: user._id.toString(),
                    subscriptionId: subscription._id.toString(),
                    chargeType: schedule.chargeType,
                    // Lets the stuck-charge reaper find the intent if this
                    // process dies before stripePaymentIntentId is saved.
                    scheduleId: schedule._id.toString()
                }
            });

            // Update schedule
            schedule.status = 'completed';
            schedule.completedAt = new Date();
            schedule.stripePaymentIntentId = paymentIntent.id;
            await schedule.save();

            // Update subscription
            if (schedule.chargeType === 'first_charge') {
                subscription.firstChargeCompleted = true;
                subscription.firstChargeAt = new Date();
                subscription.billingCycle = 1;
                subscription.status = 'active';
                await subscription.save();

                // Schedule second charge (2 months later)
                await this.scheduleSecondCharge(user._id, subscription._id, new Date());
            } else if (schedule.chargeType === 'second_charge') {
                subscription.billingCycle = 2;
                subscription.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 1 month
                await subscription.save();

                // Schedule recurring monthly charge
                await this.scheduleRecurringCharge(user._id, subscription._id, new Date());
            } else if (schedule.chargeType === 'recurring') {
                subscription.billingCycle += 1;
                subscription.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
                await subscription.save();

                // Schedule next recurring charge
                await this.scheduleRecurringCharge(user._id, subscription._id, new Date());
            }

            console.log(`Successfully processed ${schedule.chargeType} for user ${user.email}`);
            
            return {
                success: true,
                paymentIntent,
                schedule
            };

        } catch (error) {
            console.error(`Error processing charge for schedule ${scheduleId}:`, error);
            
            schedule.status = 'failed';
            schedule.error = error.message;
            await schedule.save();

            // If payment failed, update subscription status
            const subscription = await Subscription.findById(schedule.subscriptionId);
            if (subscription) {
                subscription.status = 'past_due';
                await subscription.save();
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reap charges stuck in `processing` — a crash between the atomic claim
     * and the status write leaves a row there forever, silently blocking the
     * subscription it belongs to. Blindly re-running it could double-charge,
     * so each row is reconciled against Stripe instead:
     *
     * - stored intent succeeded               -> completed (no re-charge)
     * - stored intent still pending at Stripe -> left for the next sweep
     * - metadata search by scheduleId finds a succeeded intent -> completed
     * - nothing confirms a charge             -> failed + ops note; never
     *   retried automatically (only `pending` rows are ever charged)
     *
     * Subscription state is deliberately not advanced here: the crash may
     * have happened before or after the subscription save, and advancing is
     * not idempotent (it schedules the next charge). Recovered completions
     * are logged loudly for manual follow-up.
     *
     * Rows are provider-agnostic in BillingSchedule; rows from Paystack or
     * Flutterwave cannot be verified against Stripe and are resolved as
     * failed-with-note for manual review rather than left stuck.
     */
    static async reapStuckCharges(options = {}) {
        const stuckMs = options.stuckMs ?? STUCK_PROCESSING_MS;
        const limit = options.limit ?? STUCK_REAP_BATCH;

        const stuck = await BillingSchedule.find({
            status: 'processing',
            lastAttempt: { $lt: new Date(Date.now() - stuckMs) }
        }).limit(limit);

        const summary = { scanned: stuck.length, completed: 0, failed: 0, pending: 0 };

        for (const schedule of stuck) {
            try {
                const outcome = await this.reconcileStuckCharge(schedule);
                summary[outcome] += 1;
            } catch (error) {
                // Provider unreachable: leave the row in `processing` and try
                // again on the next sweep.
                summary.pending += 1;
                console.error(
                    `Billing reaper: reconciliation failed for schedule ${schedule._id}:`,
                    error.message
                );
            }
        }

        if (summary.scanned > 0) {
            console.log(
                `Billing reaper: scanned ${summary.scanned}, completed ${summary.completed}, failed ${summary.failed}, still pending ${summary.pending}`
            );
        }

        return summary;
    }

    static async reconcileStuckCharge(schedule) {
        if (schedule.stripePaymentIntentId) {
            const intent = await stripe.paymentIntents.retrieve(schedule.stripePaymentIntentId);
            return this.applyReconciledIntent(schedule, intent);
        }

        // Newer intents carry metadata.scheduleId, so a crash before the id
        // was saved can still be reconciled without it.
        if (typeof stripe.paymentIntents.search === 'function') {
            let intent = null;
            try {
                const result = await stripe.paymentIntents.search({
                    query: `metadata['scheduleId']:'${schedule._id}'`,
                    limit: 1
                });
                intent = (result.data || [])[0] || null;
            } catch (error) {
                console.warn(
                    `Billing reaper: Stripe search unavailable for schedule ${schedule._id}:`,
                    error.message
                );
            }

            if (intent) return this.applyReconciledIntent(schedule, intent);
        }

        return this.failStuckSchedule(schedule);
    }

    static async applyReconciledIntent(schedule, intent) {
        if (intent.status === 'succeeded') {
            schedule.status = 'completed';
            schedule.completedAt = schedule.completedAt || new Date();
            schedule.stripePaymentIntentId = intent.id;
            await schedule.save();

            console.warn(
                `Billing reaper: schedule ${schedule._id} was actually charged (intent ${intent.id}) but never completed — marked completed; verify the subscription state manually.`
            );
            return 'completed';
        }

        if (STRIPE_PENDING_STATUSES.has(intent.status)) {
            // Not final yet — do not touch the row.
            return 'pending';
        }

        schedule.status = 'failed';
        schedule.error = `Stuck in processing; Stripe intent ${intent.status} (reaped)`;
        await schedule.save();
        return 'failed';
    }

    static async failStuckSchedule(schedule) {
        schedule.status = 'failed';
        schedule.error =
            'Stuck in processing; no successful charge confirmed (reaped for manual review)';
        await schedule.save();

        console.warn(
            `Billing reaper: schedule ${schedule._id} could not be confirmed as charged — marked failed for manual review; it will not be retried automatically.`
        );
        return 'failed';
    }

    /**
     * Get all pending charges that are due
     */
    static async getPendingCharges() {
        const now = new Date();
        return await BillingSchedule.find({
            status: 'pending',
            scheduledFor: { $lte: now }
        }).populate('userId subscriptionId');
    }

    /**
     * Process all due charges (run this in a cron job)
     */
    static async processDueCharges() {
        const pendingCharges = await this.getPendingCharges();
        console.log(`Found ${pendingCharges.length} pending charges to process`);

        const results = [];
        for (const charge of pendingCharges) {
            const result = await this.processCharge(charge._id);
            results.push({
                scheduleId: charge._id,
                userId: charge.userId._id,
                ...result
            });
        }

        return results;
    }

    /**
     * Cancel all pending charges for a user
     */
    static async cancelUserCharges(userId) {
        const result = await BillingSchedule.updateMany(
            { userId, status: 'pending' },
            { status: 'cancelled' }
        );
        
        console.log(`Canceled ${result.modifiedCount} pending charges for user ${userId}`);
        return result;
    }
}

module.exports = BillingScheduler;
