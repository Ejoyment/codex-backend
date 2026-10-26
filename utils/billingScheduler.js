const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paystack = require('../config/paystack');
const flutterwave = require('../config/flutterwave');
const { planAmountCents } = require('../utils/billingPricing');

// A charge row left in `processing` longer than this crashed (or lost its
// worker) between the atomic claim and the completion write. The reaper
// reconciles those rows against the rail that created them instead of blindly
// retrying them.
const STUCK_PROCESSING_MS = parseInt(process.env.BILLING_STUCK_PROCESSING_MS, 10) || 30 * 60 * 1000;
const STUCK_REAP_BATCH = parseInt(process.env.BILLING_STUCK_REAP_BATCH, 10) || 100;
const STRIPE_PENDING_STATUSES = new Set([
    'processing',
    'requires_action',
    'requires_confirmation',
    'requires_capture'
]);
const PAYSTACK_PENDING_STATUSES = new Set(['pending', 'ongoing', 'processing', 'queued']);
const FLUTTERWAVE_PENDING_STATUSES = new Set(['pending', 'processing', 'new', 'ongoing', 'queued']);
const FLUTTERWAVE_SUCCESS_STATUSES = new Set(['successful', 'success', 'completed']);
const KNOWN_PROVIDERS = new Set(['stripe', 'paystack', 'flutterwave']);

class BillingScheduler {
    /**
     * Schedule first charge when the 14-day trial ends
     */
    static async scheduleFirstCharge(userId, subscriptionId, cardAddedAt, tier = 'pro') {
        // Idempotent: repeated /setup-payment calls must not stack duplicate
        // charges on the same trial.
        const existing = await BillingSchedule.findOne({
            subscriptionId,
            chargeType: 'first_charge',
            status: 'pending'
        });
        if (existing) return existing;

        const firstChargeTime = new Date(cardAddedAt.getTime() + (14 * 24 * 60 * 60 * 1000)); // 14 days
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            provider: 'stripe',
            chargeType: 'first_charge',
            scheduledFor: firstChargeTime,
            amount: planAmountCents(tier),
            status: 'pending'
        });
        
        await schedule.save();
        console.log(`First charge scheduled for user ${userId} at ${firstChargeTime}`);
        
        return schedule;
    }

    /**
     * Schedule second charge (2 months after first charge)
     */
    static async scheduleSecondCharge(userId, subscriptionId, firstChargeDate, tier = 'pro') {
        const secondChargeTime = new Date(firstChargeDate);
        secondChargeTime.setMonth(secondChargeTime.getMonth() + 2);
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            provider: 'stripe',
            chargeType: 'second_charge',
            scheduledFor: secondChargeTime,
            amount: planAmountCents(tier),
            status: 'pending'
        });
        
        await schedule.save();
        console.log(`Second charge scheduled for user ${userId} at ${secondChargeTime}`);
        
        return schedule;
    }

    /**
     * Schedule recurring monthly charge
     */
    static async scheduleRecurringCharge(userId, subscriptionId, lastChargeDate, tier = 'pro') {
        const nextChargeTime = new Date(lastChargeDate);
        nextChargeTime.setMonth(nextChargeTime.getMonth() + 1);
        
        const schedule = new BillingSchedule({
            userId,
            subscriptionId,
            provider: 'stripe',
            chargeType: 'recurring',
            scheduledFor: nextChargeTime,
            amount: planAmountCents(tier),
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
            schedule.provider = 'stripe';
            schedule.status = 'completed';
            schedule.completedAt = new Date();
            schedule.stripePaymentIntentId = paymentIntent.id;
            schedule.providerStatus = paymentIntent.status;
            await schedule.save();

            // Update subscription
            if (schedule.chargeType === 'first_charge') {
                subscription.firstChargeCompleted = true;
                subscription.firstChargeAt = new Date();
                subscription.billingCycle = 1;
                subscription.status = 'active';
                await subscription.save();

                // Schedule second charge (2 months later)
                await this.scheduleSecondCharge(user._id, subscription._id, new Date(), subscription.tier);
            } else if (schedule.chargeType === 'second_charge') {
                subscription.billingCycle = 2;
                subscription.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 1 month
                await subscription.save();

                // Schedule recurring monthly charge
                await this.scheduleRecurringCharge(user._id, subscription._id, new Date(), subscription.tier);
            } else if (schedule.chargeType === 'recurring') {
                subscription.billingCycle += 1;
                subscription.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
                await subscription.save();

                // Schedule next recurring charge
                await this.scheduleRecurringCharge(user._id, subscription._id, new Date(), subscription.tier);
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
     * so each row is reconciled against the provider that created it:
     *
     * Stripe:
     * - stored intent succeeded               -> completed (no re-charge)
     * - stored intent still pending at Stripe -> left for the next sweep
     * - metadata search by scheduleId finds a succeeded intent -> completed
     * - nothing confirms a charge             -> failed + ops note
     *
     * Paystack:
     * - verify by stored reference (or the deterministic `bs-<scheduleId>`
     *   reference the scheduler now sends) -> success/pending/failed
     * - no reference can be verified          -> failed + ops note
     *
     * Flutterwave:
     * - verify by stored transaction id       -> successful/pending/failed
     * - transaction id was never persisted    -> failed + ops note (the
     *   configured client only supports lookup by id, not tx_ref)
     *
     * Subscription state is deliberately not advanced here: the crash may
     * have happened before or after the subscription save, and advancing is
     * not idempotent (it schedules the next charge). Recovered completions
     * are logged loudly for manual follow-up. No provider is ever charged
     * from this path, so a reap cannot double-charge or double-activate.
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

    /**
     * Older Paystack rows may not have the reference persisted (the field was
     * previously dropped by strict mode). The scheduler now sends a stable
     * reference derived from the schedule id, so a crash before the response
     * was saved can still be verified without charging again.
     */
    static paystackReferenceFor(schedule) {
        return schedule.paystackReference || `bs-${String(schedule._id)}`;
    }

    static flutterwaveTxRefFor(schedule) {
        return `charge_${String(schedule._id)}`;
    }

    static providerForSchedule(schedule) {
        if (schedule.provider && KNOWN_PROVIDERS.has(String(schedule.provider).toLowerCase())) {
            return String(schedule.provider).toLowerCase();
        }
        if (schedule.paystackReference) return 'paystack';
        if (schedule.flutterwaveTransactionId) return 'flutterwave';
        if (schedule.stripePaymentIntentId) return 'stripe';
        // Pre-provider-field rows default to Stripe, preserving the original
        // reaper behavior for the only rail that existed when they were made.
        return 'stripe';
    }

    static async resolveProviderForSchedule(schedule) {
        const inferred = this.providerForSchedule(schedule);
        const ambiguous =
            !schedule.provider &&
            !schedule.paystackReference &&
            !schedule.flutterwaveTransactionId &&
            !schedule.stripePaymentIntentId;

        // Rows created before the provider field existed can still be routed
        // correctly by their subscription's paymentProvider. Only ambiguous
        // rows pay for this lookup; a failure keeps the Stripe fallback.
        if (ambiguous && schedule.subscriptionId) {
            try {
                const query = Subscription.findById(schedule.subscriptionId);
                const subscription =
                    query && typeof query.select === 'function'
                        ? await query.select('paymentProvider')
                        : await query;
                const subscriptionProvider =
                    subscription && subscription.paymentProvider
                        ? String(subscription.paymentProvider).toLowerCase()
                        : null;
                if (subscriptionProvider && KNOWN_PROVIDERS.has(subscriptionProvider)) {
                    return subscriptionProvider;
                }
            } catch (error) {
                console.warn(
                    `Billing reaper: could not resolve provider for schedule ${schedule._id} from its subscription:`,
                    error.message
                );
            }
        }

        return inferred;
    }

    static async reconcileStuckCharge(schedule) {
        // A live worker may have completed the row after the scan loaded it.
        // Stand down instead of overwriting a newer terminal state.
        if (schedule.status && schedule.status !== 'processing') {
            if (schedule.status === 'completed') return 'completed';
            if (schedule.status === 'failed') return 'failed';
            return 'pending';
        }

        const provider = await this.resolveProviderForSchedule(schedule);

        if (provider === 'paystack') return this.reconcilePaystackCharge(schedule);
        if (provider === 'flutterwave') return this.reconcileFlutterwaveCharge(schedule);
        return this.reconcileStripeCharge(schedule);
    }

    static async reconcileStripeCharge(schedule) {
        schedule.provider = 'stripe';

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

        return this.failStuckSchedule(schedule, 'no successful charge confirmed', 'stripe');
    }

    static async applyReconciledIntent(schedule, intent) {
        if (intent.status === 'succeeded') {
            schedule.provider = 'stripe';
            schedule.status = 'completed';
            schedule.completedAt = schedule.completedAt || new Date();
            schedule.stripePaymentIntentId = intent.id;
            schedule.providerStatus = intent.status;
            schedule.reconciledAt = new Date();
            await schedule.save();

            console.warn(
                `Billing reaper: schedule ${schedule._id} was actually charged (Stripe intent ${intent.id}) but never completed — marked completed; verify the subscription state manually.`
            );
            return 'completed';
        }

        if (STRIPE_PENDING_STATUSES.has(intent.status)) {
            // Not final yet — do not touch the row.
            return 'pending';
        }

        schedule.provider = 'stripe';
        schedule.providerStatus = intent.status;
        return this.failStuckSchedule(
            schedule,
            `Stripe intent ${intent.status}`,
            'stripe'
        );
    }

    static async reconcilePaystackCharge(schedule) {
        schedule.provider = 'paystack';
        const reference = this.paystackReferenceFor(schedule);
        if (!reference) {
            return this.failStuckSchedule(
                schedule,
                'no Paystack reference available to verify',
                'paystack'
            );
        }

        let response;
        try {
            response = await paystack.transaction.verify({ reference });
        } catch (error) {
            if (this.isNonRetryableProviderError(error)) {
                return this.failStuckSchedule(
                    schedule,
                    `Paystack could not verify reference ${reference}: ${error.message}`,
                    'paystack'
                );
            }
            throw error;
        }

        const data = (response && response.data) || {};
        const status = data.status ? String(data.status).toLowerCase() : null;
        const actualReference = data.reference || reference;

        schedule.providerStatus = status || 'unknown';
        schedule.paystackReference = actualReference;

        if (status === 'success') {
            return this.completeReconciledSchedule(
                schedule,
                'paystack',
                `Paystack reference ${actualReference}`
            );
        }

        if (PAYSTACK_PENDING_STATUSES.has(status)) {
            // Not final yet — do not touch the row.
            return 'pending';
        }

        if (!status) {
            const detail = response && response.message ? `: ${response.message}` : '';
            return this.failStuckSchedule(
                schedule,
                `Paystack verify returned no transaction status for reference ${reference}${detail}`,
                'paystack'
            );
        }

        return this.failStuckSchedule(
            schedule,
            `Paystack transaction ${actualReference} is ${status}`,
            'paystack'
        );
    }

    static async reconcileFlutterwaveCharge(schedule) {
        schedule.provider = 'flutterwave';
        const transactionId = schedule.flutterwaveTransactionId || null;

        if (!transactionId) {
            return this.failStuckSchedule(
                schedule,
                `Flutterwave transaction id was not persisted (expected tx_ref ${this.flutterwaveTxRefFor(schedule)}); the configured client can only verify by id`,
                'flutterwave'
            );
        }

        let response;
        try {
            response = await flutterwave.Transaction.verify({ id: transactionId });
        } catch (error) {
            if (this.isNonRetryableProviderError(error)) {
                return this.failStuckSchedule(
                    schedule,
                    `Flutterwave could not verify transaction ${transactionId}: ${error.message}`,
                    'flutterwave'
                );
            }
            throw error;
        }

        const data = (response && response.data) || {};
        const status = data.status ? String(data.status).toLowerCase() : null;
        const actualId = data.id != null ? String(data.id) : String(transactionId);

        schedule.providerStatus = status || 'unknown';
        schedule.flutterwaveTransactionId = actualId;

        if (status && FLUTTERWAVE_SUCCESS_STATUSES.has(status)) {
            return this.completeReconciledSchedule(
                schedule,
                'flutterwave',
                `Flutterwave transaction ${actualId}`
            );
        }

        if (FLUTTERWAVE_PENDING_STATUSES.has(status)) {
            // Not final yet — do not touch the row.
            return 'pending';
        }

        if (!status) {
            const detail = response && response.message ? `: ${response.message}` : '';
            return this.failStuckSchedule(
                schedule,
                `Flutterwave verify returned no transaction status for id ${transactionId}${detail}`,
                'flutterwave'
            );
        }

        return this.failStuckSchedule(
            schedule,
            `Flutterwave transaction ${actualId} is ${status}`,
            'flutterwave'
        );
    }

    static async completeReconciledSchedule(schedule, provider, detail) {
        schedule.provider = provider;
        schedule.status = 'completed';
        schedule.completedAt = schedule.completedAt || new Date();
        schedule.reconciledAt = new Date();
        await schedule.save();

        console.warn(
            `Billing reaper: schedule ${schedule._id} was actually charged (${detail}) but never completed — marked completed; verify the subscription state manually.`
        );
        return 'completed';
    }

    static isNonRetryableProviderError(error) {
        if (!error) return false;
        if (/not configured/i.test(error.message || '')) return true;
        const status = error.response && error.response.status;
        return status === 400 || status === 401 || status === 403 || status === 404;
    }

    static async failStuckSchedule(
        schedule,
        reason = 'no successful charge confirmed',
        provider = this.providerForSchedule(schedule)
    ) {
        schedule.provider = provider;
        schedule.status = 'failed';
        schedule.error = `Stuck in processing; ${reason} (reaped for manual review)`;
        schedule.reconciledAt = new Date();
        await schedule.save();

        console.warn(
            `Billing reaper: ${provider} schedule ${schedule._id} could not be confirmed as charged (${reason}) — marked failed for manual review; it will not be retried automatically.`
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
