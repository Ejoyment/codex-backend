const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const paystack = require('../config/paystack');

class PaystackScheduler {
    /**
     * Schedule first charge (14 days after card added - when trial ends)
     */
    static async scheduleFirstCharge(userId, subscriptionId, cardAddedAt) {
        const scheduledFor = new Date(cardAddedAt.getTime() + (14 * 24 * 60 * 60 * 1000)); // 14 days
        const amount = 1000000; // ₦10,000 in kobo

        const billingSchedule = new BillingSchedule({
            userId,
            subscriptionId,
            chargeType: 'first_charge',
            scheduledFor,
            amount,
            status: 'pending'
        });

        await billingSchedule.save();
        console.log(`✓ First charge scheduled for user ${userId} at ${scheduledFor}`);
        return billingSchedule;
    }

    /**
     * Schedule second charge (2 months after first charge)
     */
    static async scheduleSecondCharge(userId, subscriptionId, firstChargeDate) {
        const scheduledFor = new Date(firstChargeDate);
        scheduledFor.setMonth(scheduledFor.getMonth() + 2); // 2 months later
        const amount = 1000000; // ₦10,000 in kobo

        const billingSchedule = new BillingSchedule({
            userId,
            subscriptionId,
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
    static async scheduleRecurringCharge(userId, subscriptionId, lastChargeDate) {
        const scheduledFor = new Date(lastChargeDate);
        scheduledFor.setMonth(scheduledFor.getMonth() + 1); // 1 month later
        const amount = 1000000; // ₦10,000 in kobo

        const billingSchedule = new BillingSchedule({
            userId,
            subscriptionId,
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

            // Charge using saved authorization
            const response = await paystack.transaction.charge({
                email: user.email,
                amount: billingSchedule.amount,
                authorization_code: subscription.paymentId,
                currency: 'NGN',
                metadata: {
                    userId: subscription.userId.toString(),
                    subscriptionId: subscription._id.toString(),
                    chargeType: billingSchedule.chargeType
                }
            });

            if (response.status && response.data.status === 'success') {
                // Update billing schedule
                billingSchedule.status = 'completed';
                billingSchedule.completedAt = new Date();
                billingSchedule.paystackReference = response.data.reference;
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
                        now
                    );
                } else if (billingSchedule.chargeType === 'second_charge') {
                    subscription.billingCycle = 2;
                    subscription.nextBillingDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                    await subscription.save();

                    // Schedule recurring charge
                    await this.scheduleRecurringCharge(
                        subscription.userId,
                        subscription._id,
                        now
                    );
                } else if (billingSchedule.chargeType === 'recurring') {
                    subscription.billingCycle += 1;
                    subscription.nextBillingDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                    await subscription.save();

                    // Schedule next recurring charge
                    await this.scheduleRecurringCharge(
                        subscription.userId,
                        subscription._id,
                        now
                    );
                }

                console.log(`✓ Successfully processed ${billingSchedule.chargeType} for user ${subscription.userId}`);
                return { success: true, reference: response.data.reference };
            } else {
                throw new Error(response.message || 'Charge failed');
            }

        } catch (error) {
            console.error(`✗ Charge failed for billing schedule ${billingSchedule._id}:`, error.message);
            
            billingSchedule.status = 'failed';
            billingSchedule.attempts += 1;
            billingSchedule.error = error.message;
            await billingSchedule.save();

            // Update subscription status and downgrade to freebie tier
            const subscription = await Subscription.findById(billingSchedule.subscriptionId);
            if (subscription) {
                // Downgrade to freebie tier (NO REFUND)
                subscription.upgradeTo('freebie');
                subscription.status = 'cancelled';
                subscription.cancelledAt = new Date();
                subscription.isTrialWithCard = false;
                subscription.firstChargeCompleted = false;
                subscription.billingCycle = 0;
                subscription.nextBillingDate = null;
                await subscription.save();
                
                console.log(`✗ Payment failed for user ${subscription.userId}, downgraded to freebie tier`);
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
                scheduledFor: { $lte: new Date(now.getTime() + (60 * 1000)) } // Due within next 60 seconds
            });

            console.log(`Found ${dueCharges.length} charges to process`);

            for (const charge of dueCharges) {
                charge.status = 'processing';
                await charge.save();

                await this.processCharge(charge);
            }

            return { processed: dueCharges.length };
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
            { status: 'canceled', canceledAt: new Date() }
        );
        console.log(`✓ Canceled all pending charges for user ${userId}`);
    }
}

module.exports = PaystackScheduler;
