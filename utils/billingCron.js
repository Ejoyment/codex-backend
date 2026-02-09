const cron = require('node-cron');
const BillingScheduler = require('./billingScheduler');

/**
 * Billing Cron Jobs
 * Processes scheduled charges every minute
 */
class BillingCron {
    static start() {
        // Run every minute to check for due charges
        cron.schedule('* * * * *', async () => {
            console.log('Running billing cron job...');
            
            try {
                const results = await BillingScheduler.processDueCharges();
                
                if (results.length > 0) {
                    console.log(`Processed ${results.length} charges:`);
                    results.forEach(result => {
                        if (result.success) {
                            console.log(`✓ Successfully charged user ${result.userId}`);
                        } else {
                            console.log(`✗ Failed to charge user ${result.userId}: ${result.error}`);
                        }
                    });
                }
            } catch (error) {
                console.error('Billing cron error:', error);
            }
        });

        console.log('Billing cron job started - checking for due charges every minute');
    }

    /**
     * Process charges immediately (for testing)
     */
    static async processNow() {
        console.log('Processing charges immediately...');
        return await BillingScheduler.processDueCharges();
    }
}

module.exports = BillingCron;
