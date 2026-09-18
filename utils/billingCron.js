const cron = require('node-cron');
const mongoose = require('mongoose');
const PaystackScheduler = require('./paystackScheduler');
const StripeBillingScheduler = require('./billingScheduler');

/**
 * Billing Cron Jobs
 * Processes scheduled charges every minute
 * 
 * Made resilient so it NEVER disrupts the server:
 * - Waits for MongoDB connection before processing
 * - Skips gracefully when payment providers are not configured
 * - Never throws unhandled errors that could crash the process
 */
class BillingCron {
    static start() {
        // Run every minute to check for due charges; keep reference for stop
        if (this._task) {
            this._task.destroy();
        }

        this._task = cron.schedule('* * * * *', async () => {
            try {
                // Don't run if MongoDB isn't connected yet
                if (mongoose.connection.readyState !== 1) {
                    console.log('⏳ Billing cron: MongoDB not connected yet, skipping this run');
                    return;
                }

                // Process Paystack charges if configured
                if (process.env.PAYSTACK_SECRET_KEY) {
                    console.log('Running billing cron job (Paystack)...');
                    try {
                        const result = await PaystackScheduler.processScheduledCharges();
                        if (result.processed > 0) {
                            console.log(`✓ Processed ${result.processed} Paystack charges`);
                        }
                    } catch (error) {
                        console.error('Paystack cron error (non-fatal):', error.message);
                    }
                }

                // Process Stripe charges
                console.log('Processing Stripe billing cron...');
                try {
                    const stripeResults = await StripeBillingScheduler.processDueCharges();
                    if (stripeResults.length > 0) {
                        console.log(`✓ Processed ${stripeResults.length} Stripe charges`);
                    }
                } catch (error) {
                    console.error('Stripe cron error (non-fatal):', error.message);
                }

                // Trial lifecycle checks: find trials that have expired or are in last day
                try {
                    await this.checkTrialLifecycle();
                } catch (error) {
                    console.error('Trial lifecycle check error (non-fatal):', error.message);
                }
            } catch (error) {
                // Never let the cron job crash the server
                console.error('Billing cron error (non-fatal):', error.message);
            }
        });

        console.log('✓ Billing cron job started - checking for due charges every minute');
    }

    /**
     * Check trial lifecycle: send reminders, auto-downgrade expired trials
     */
    static async checkTrialLifecycle() {
        const Subscription = require('../models/Subscription');
        const User = require('../models/User');
        const emailService = require('./emailServiceResend');

        // Find active trials
        const activeTrials = await Subscription.find({ status: 'trial' });

        for (const subscription of activeTrials) {
            try {
                const user = await User.findById(subscription.userId);
                if (!user) continue;

                const daysLeft = subscription.getTrialDaysLeft();
                const isExpired = subscription.isTrialExpired();

                // Handle expired trials - auto downgrade
                if (isExpired) {
                    subscription.status = 'expired';
                    subscription.upgradeTo('freebie');
                    await subscription.save();

                    // Send trial expired email
                    try {
                        await emailService.sendTrialExpiredEmail(user.email, user.fullName);
                        console.log(`Trial expired email sent to ${user.email}`);
                    } catch (emailError) {
                        console.error('Trial expired email error:', emailError);
                    }

                    console.log(`Auto-downgraded user ${user.email} from trial to freebie (trial expired)`);
                    continue;
                }

                // Send reminder on last day (once)
                const reminderKey = `trialReminder_${daysLeft}`;
                if (daysLeft <= 3 && !subscription.metadata?.[reminderKey]) {
                    try {
                        await emailService.sendTrialReminderEmail(user.email, user.fullName, daysLeft);
                        subscription.metadata = { ...subscription.metadata, [reminderKey]: true };
                        await subscription.save();
                        console.log(`Trial reminder (${daysLeft} days left) sent to ${user.email}`);
                    } catch (emailError) {
                        console.error('Trial reminder email error:', emailError);
                    }
                }
            } catch (error) {
                console.error(`Trial check error for subscription ${subscription._id}:`, error.message);
            }
        }
    }

    /**
     * Process charges immediately (for testing)
     */
    static async processNow() {
        console.log('Processing charges immediately...');
        
        const results = [];
        
        // Process Paystack
        if (process.env.PAYSTACK_SECRET_KEY) {
            console.log('Processing Paystack charges...');
            const paystackResult = await PaystackScheduler.processScheduledCharges();
            results.push({ provider: 'paystack', ...paystackResult });
        }
        
        // Process Stripe
        console.log('Processing Stripe charges...');
        const stripeResult = await StripeBillingScheduler.processDueCharges();
        results.push({ provider: 'stripe', processed: stripeResult.length, results: stripeResult });
        
        return results;
    }

    static stop() {
        if (this._task) {
            try {
                this._task.destroy();
            } catch (e) {
                // ignore
            }
            this._task = null;
        }
    }
}

module.exports = BillingCron;