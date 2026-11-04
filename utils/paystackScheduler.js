const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const paystack = require('../config/paystack');
const { planAmountCents } = require('../utils/billingPricing');
const { scheduleFirstCharge } = require('./firstChargeSchedule');

class PaystackScheduler {
    /**
     * Schedule first charge (14 days after card added - when trial ends)
     */
    static async scheduleFirstCharge(userId, subscriptionId, cardAddedAt, tier = 'pro') {
        const scheduledFor = new Date(cardAddedAt.getTime() + (14 * 24 * 60 * 60 * 1000)); // 14 days
        const billingSchedule = await scheduleFirstCharge({
            userId,
            subscriptionId,
            cardAddedAt,
            tier,
            provider: 'paystack',
        });

        console.log(`✓ First charge scheduled for user ${userId} at ${scheduledFor}`);
        return billingSchedule;
    }

    /**
     * Schedule second charge (2 months after first charge)
     */
    static async scheduleSecondCharge(userId, subscriptionId, firstChargeDate, tier = 'pro') {
        const scheduledFor = new Date(firstChargeDate);
        scheduledFor.setMonth(scheduledFor.getMonth() + 2); // 2 months later
        const amount = planAmountCents(tier);

        const billingSchedule = new BillingSchedule({
            userId,
            subscriptionId,
            provider: 'paystack',
            chargeType: 'second_charge',
            scheduledFor,
            amount,
            status: 'pending'
        });

        await billingSchedule.save();
        console.log(`✓ Second charge scheduled for user ${userId} at ${scheduledFor}`);
        return billingSchedule;
    }

    /**
     * Schedule recurring monthly charge
     */
    static async scheduleRecurringCharge(userId, subscriptionId, lastChargeDate, tier = 'pro') {
        const scheduledFor = new Date(lastChargeDate);
        scheduledFor.setMonth(scheduledFor.getMonth() + 1); // 1 month later
        const amount = planAmountCents(tier);

        const billingSchedule = new BillingSchedule({
            userId,
            subscriptionId,
            provider: 'paystack',
            chargeType: 'recurring',
            scheduledFor,
            amount,
            status: 'pending'
        });

        await billingSchedule.save();
        console.log(`✓ Recurring charge scheduled for user ${userId} at ${scheduledFor}`);
        return billingSchedule;
    }

    /**
     * Process a scheduled charge using Paystack
     */
    static async processCharge(billingSchedule) {
        try {
            const subscription = await Subscription.findById(billingSchedule.subscriptionId);
            if (!subscription) {
                throw new Error('Subscription not found');
            }

            if (!subscription.paymentId) {
                throw new Error('No authorization code found');
            }

            // Get user email
            const User = require('../models/User');
            const user = await User.findById(subscription.userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Stable reference: if this process dies after Paystack charged but
            // before the reference is saved, the reaper can verify this exact
            // reference instead of guessing (and without charging again).
            const reference =
                billingSchedule.paystackReference || `bs-${String(billingSchedule._id)}`;

            // Charge using saved authorization
            const response = await paystack.transaction.charge({
                email: user.email,
                amount: billingSchedule.amount,
                authorization_code: subscription.paymentId,
                currency: 'USD',
                reference,
                metadata: {
                    userId: subscription.userId.toString(),
                    subscriptionId: subscription._id.toString(),
                    scheduleId: billingSchedule._id.toString(),
                    chargeType: billingSchedule.chargeType
                }
            });

            if (response.status && response.data.status === 'success') {
                // Update billing schedule
                billingSchedule.provider = 'paystack';
                billingSchedule.status = 'completed';
                billingSchedule.completedAt = new Date();
                billingSchedule.paystackReference = response.data.reference || reference;
                billingSchedule.providerStatus = response.data.status;
                await billingSchedule.save();

                // Update subscription
                const now = new Date();
                if (billingSchedule.chargeType === 'first_charge') {
                    subscription.firstChargeAt = now;
                    subscription.firstChargeCompleted = true;
                    subscription.billingCycle = 1;
                    subscription.status = 'active';
                    await subscription.save();

                    // Schedule second charge
                    await this.scheduleSecondCharge(
                        subscription.userId,
                        subscription._id,
                        now,
                        subscription.tier
                    );
                } else if (billingSchedule.chargeType === 'second_charge') {
                    subscription.billingCycle = 2;
                    subscription.nextBillingDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                    await subscription.save();

                    // Schedule recurring charge
                    await this.scheduleRecurringCharge(
                        subscription.userId,
                        subscription._id,
                        now,
                        subscription.tier
                    );
                } else if (billingSchedule.chargeType === 'recurring') {
                    subscription.billingCycle += 1;
                    subscription.nextBillingDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                    await subscription.save();

                    // Schedule next recurring charge
                    await this.scheduleRecurringCharge(
                        subscription.userId,
                        subscription._id,
                        now,
                        subscription.tier
                    );
                }

                console.log(`✓ Successfully processed ${billingSchedule.chargeType} for user ${subscription.userId}`);
                return { success: true, reference: response.data.reference };
            } else {
                billingSchedule.provider = 'paystack';
                billingSchedule.providerStatus =
                    (response.data && response.data.status) || null;
                throw new Error(response.message || 'Charge failed');
            }

        } catch (error) {
            console.error(`✗ Charge failed for billing schedule ${billingSchedule._id}:`, error.message);
            
            billingSchedule.provider = 'paystack';
            billingSchedule.status = 'failed';
            billingSchedule.attempts += 1;
            billingSchedule.error = error.message;
            await billingSchedule.save();

            // Keep the paid tier and card on file for a grace/retry window,
            // matching Flutterwave. Only an explicit cancellation downgrades.
            const subscription = await Subscription.findById(billingSchedule.subscriptionId);
            if (subscription && subscription.status !== 'past_due') {
                subscription.status = 'past_due';
                await subscription.save();

                console.log(`✗ Payment failed for user ${subscription.userId}, marked past_due`);
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Process all scheduled charges that are due
     */
    static async processScheduledCharges() {
        try {
            const now = new Date();
            const dueCharges = await BillingSchedule.find({
                status: 'pending',
                provider: 'paystack',
                scheduledFor: { $lte: new Date(now.getTime() + (60 * 1000)) } // Due within next 60 seconds
            });

            console.log(`Found ${dueCharges.length} charges to process`);

            let claimedCount = 0;
            for (const charge of dueCharges) {
                // Atomic claim (see billingScheduler.processCharge): concurrent
                // ticks must not both charge. Loser skips silently.
                const claimed = await BillingSchedule.findOneAndUpdate(
                    { _id: charge._id, status: 'pending' },
                    { status: 'processing', lastAttempt: new Date() },
                    { new: true }
                );
                if (!claimed) continue;
                claimedCount += 1;

                await this.processCharge(claimed);
            }

            return { processed: claimedCount };
        } catch (error) {
            console.error('Error processing scheduled charges:', error);
            throw error;
        }
    }

    /**
     * Cancel all pending charges for a user
     */
    static async cancelUserCharges(userId) {
        await BillingSchedule.updateMany(
            { userId, status: 'pending' },
            { status: 'cancelled', cancelledAt: new Date() }
        );
        console.log(`✓ Canceled all pending charges for user ${userId}`);
    }
}

module.exports = PaystackScheduler;
