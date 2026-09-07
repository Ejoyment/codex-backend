const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
        const schedule = await BillingSchedule.findById(scheduleId);
        
        if (!schedule || schedule.status !== 'pending') {
            console.log(`Schedule ${scheduleId} not found or not pending`);
            return { success: false, message: 'Schedule not found or not pending' };
        }

        // Update status to processing
        schedule.status = 'processing';
        schedule.attempts += 1;
        schedule.lastAttempt = new Date();
        await schedule.save();

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
                    chargeType: schedule.chargeType
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
            { status: 'canceled' }
        );
        
        console.log(`Canceled ${result.modifiedCount} pending charges for user ${userId}`);
        return result;
    }
}

module.exports = BillingScheduler;
