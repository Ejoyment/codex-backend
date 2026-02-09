const BillingSchedule = require('../models/BillingSchedule');
const Subscription = require('../models/Subscription');
const flw = require('../config/flutterwave');

/**
 * Schedule first charge (10 seconds after card is added)
 */
async function scheduleFirstCharge(userId, subscriptionId, cardAddedAt) {
    const firstChargeTime = new Date(cardAddedAt.getTime() + (10 * 1000)); // 10 seconds

    const billingSchedule = new BillingSchedule({
        userId,
        subscriptionId,
        chargeType: 'first_charge',
        scheduledFor: firstChargeTime,
        amount: 10000, // ₦10,000 (approximately $25 USD)
        status: 'pending'
    });

    await billingSchedule.save();
    console.log(`✓ First charge scheduled for user ${userId} at ${firstChargeTime}`);
    
    return billingSchedule;
}

/**
 * Schedule second charge (2 months after first charge)
 */
async function scheduleSecondCharge(userId, subscriptionId, firstChargeDate) {
    const secondChargeTime = new Date(firstChargeDate);
    secondChargeTime.setMonth(secondChargeTime.getMonth() + 2); // 2 months later

    const billingSchedule = new BillingSchedule({
        userId,
        subscriptionId,
        chargeType: 'second_charge',
        scheduledFor: secondChargeTime,
        amount: 10000, // ₦10,000
        status: 'pending'
    });

    await billingSchedule.save();
    console.log(`✓ Second charge scheduled for user ${userId} at ${secondChargeTime}`);
    
    return billingSchedule;
}

/**
 * Schedule recurring monthly charge
 */
async function scheduleRecurringCharge(userId, subscriptionId, lastChargeDate) {
    const nextChargeTime = new Date(lastChargeDate);
    nextChargeTime.setMonth(nextChargeTime.getMonth() + 1); // 1 month later

    const billingSchedule = new BillingSchedule({
        userId,
        subscriptionId,
        chargeType: 'recurring',
        scheduledFor: nextChargeTime,
        amount: 10000, // ₦10,000
        status: 'pending'
    });

    await billingSchedule.save();
    console.log(`✓ Recurring charge scheduled for user ${userId} at ${nextChargeTime}`);
    
    return billingSchedule;
}

/**
 * Process a scheduled charge using Flutterwave
 */
async function processCharge(billingSchedule) {
    try {
        console.log(`Processing ${billingSchedule.chargeType} for user ${billingSchedule.userId}...`);

        const subscription = await Subscription.findById(billingSchedule.subscriptionId);
        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // Get customer ID and payment token
        const customerId = subscription.customerId;
        const paymentToken = subscription.paymentId;

        if (!customerId || !paymentToken) {
            throw new Error('Customer ID or payment token not found');
        }

        // Create charge using Flutterwave tokenized charge
        const payload = {
            token: paymentToken,
            currency: 'NGN',
            country: 'NG',
            amount: billingSchedule.amount / 100, // Convert kobo to naira
            email: subscription.email || 'customer@buildershq.com',
            tx_ref: `charge_${billingSchedule._id}_${Date.now()}`,
            narration: `BuildrsHQ ${billingSchedule.chargeType.replace('_', ' ')}`,
        };

        const response = await flw.Tokenized.charge(payload);

        if (response.status === 'success') {
            // Update billing schedule
            billingSchedule.status = 'completed';
            billingSchedule.flutterwaveTransactionId = response.data.id;
            billingSchedule.completedAt = new Date();
            await billingSchedule.save();

            // Update subscription
            if (billingSchedule.chargeType === 'first_charge') {
                subscription.firstChargeAt = new Date();
                subscription.firstChargeCompleted = true;
                subscription.billingCycle = 1;
                subscription.status = 'active';
                await subscription.save();

                // Schedule second charge
                await scheduleSecondCharge(
                    billingSchedule.userId,
                    billingSchedule.subscriptionId,
                    new Date()
                );
            } else if (billingSchedule.chargeType === 'second_charge') {
                subscription.billingCycle = 2;
                await subscription.save();

                // Schedule first recurring charge
                await scheduleRecurringCharge(
                    billingSchedule.userId,
                    billingSchedule.subscriptionId,
                    new Date()
                );
            } else if (billingSchedule.chargeType === 'recurring') {
                subscription.billingCycle += 1;
                subscription.nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
                await subscription.save();

                // Schedule next recurring charge
                await scheduleRecurringCharge(
                    billingSchedule.userId,
                    billingSchedule.subscriptionId,
                    new Date()
                );
            }

            console.log(`✓ Successfully processed ${billingSchedule.chargeType} for user ${billingSchedule.userId}`);
            return { success: true, data: response.data };
        } else {
            throw new Error(response.message || 'Charge failed');
        }

    } catch (error) {
        console.error(`✗ Charge failed for user ${billingSchedule.userId}:`, error.message);

        // Update billing schedule with error
        billingSchedule.status = 'failed';
        billingSchedule.error = error.message;
        billingSchedule.attempts += 1;
        await billingSchedule.save();

        // Update subscription status
        const subscription = await Subscription.findById(billingSchedule.subscriptionId);
        if (subscription) {
            subscription.status = 'past_due';
            await subscription.save();
        }

        return { success: false, error: error.message };
    }
}

/**
 * Process all scheduled charges that are due
 */
async function processScheduledCharges() {
    try {
        const now = new Date();
        const oneMinuteFromNow = new Date(now.getTime() + (60 * 1000));

        // Find all pending charges that are due within the next minute
        const dueCharges = await BillingSchedule.find({
            status: 'pending',
            scheduledFor: {
                $lte: oneMinuteFromNow
            }
        });

        console.log(`Found ${dueCharges.length} charges to process`);

        for (const charge of dueCharges) {
            await processCharge(charge);
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
async function cancelUserCharges(userId) {
    try {
        const result = await BillingSchedule.updateMany(
            { userId, status: 'pending' },
            { status: 'canceled' }
        );

        console.log(`✓ Canceled ${result.modifiedCount} pending charges for user ${userId}`);
        return result;
    } catch (error) {
        console.error('Error canceling charges:', error);
        throw error;
    }
}

module.exports = {
    scheduleFirstCharge,
    scheduleSecondCharge,
    scheduleRecurringCharge,
    processCharge,
    processScheduledCharges,
    cancelUserCharges
};
