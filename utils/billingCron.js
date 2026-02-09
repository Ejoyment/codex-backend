const cron = require('node-cron');
const PaystackScheduler = require('./paystackScheduler');

/**
 * Billing Cron Jobs
 * Processes scheduled charges every minute
 */
class BillingCron {
    static start() {
        // Run every minute to check for due charges
        cron.schedule('* * * * *', async () => {
            console.log('Running billing cron job (Paystack)...');
            
            try {
                const result = await PaystackScheduler.processScheduledCharges();
                
                if (result.processed > 0) {
                    console.log(`✓ Processed ${result.processed} Paystack charges`);
                }
            } catch (error) {
                console.error('Billing cron error:', error);
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
}

module.exports = BillingCron;
