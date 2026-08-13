const cron = require('node-cron');
const mongoose = require('mongoose');
const PaystackScheduler = require('./paystackScheduler');

/**
 * Billing Cron Jobs
 * Processes scheduled charges every minute
 * 
 * Made resilient so it NEVER disrupts the server:
 * - Waits for MongoDB connection before processing
 * - Skips gracefully when Paystack is not configured
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

                // Don't run if Paystack isn't configured
                if (!process.env.PAYSTACK_SECRET_KEY) {
                    // Only log once to avoid log spam
                    if (!this._warnedNoPaystack) {
                        console.warn('⚠️  Billing cron: Paystack not configured (PAYSTACK_SECRET_KEY missing), skipping charges');
                        this._warnedNoPaystack = true;
                    }
                    return;
                }

                console.log('Running billing cron job (Paystack)...');
                
                const result = await PaystackScheduler.processScheduledCharges();
                
                if (result.processed > 0) {
                    console.log(`✓ Processed ${result.processed} Paystack charges`);
                }
            } catch (error) {
                // Never let the cron job crash the server
                console.error('Billing cron error (non-fatal):', error.message);
            }
        });

        console.log('✓ Paystack billing cron job started - checking for due charges every minute');
    }

    /**
     * Process charges immediately (for testing)
     */
    static async processNow() {
        console.log('Processing Paystack charges immediately...');
        return await PaystackScheduler.processScheduledCharges();
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