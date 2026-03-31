const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');
const Subscription = require('./models/Subscription');

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const CHARGE_AMOUNT = 10000; // ₦10,000 in kobo

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// Charge a single card
async function chargeCard(user, subscription) {
    try {
        console.log(`\n📝 Processing: ${user.email}`);
        
        // Check if authorization code exists
        if (!subscription.paymentId) {
            console.log(`⚠️  Skipped: No payment method on file`);
            return { success: false, reason: 'no_payment_method' };
        }

        // Check if already charged (you can add a flag to track this)
        if (subscription.metadata && subscription.metadata.retroactiveChargeCompleted) {
            console.log(`⚠️  Skipped: Already charged`);
            return { success: false, reason: 'already_charged' };
        }

        // Charge the card using Paystack
        const response = await axios.post(
            'https://api.paystack.co/transaction/charge_authorization',
            {
                email: user.email,
                amount: CHARGE_AMOUNT,
                authorization_code: subscription.paymentId,
                currency: 'NGN',
                metadata: {
                    userId: user._id.toString(),
                    subscriptionId: subscription._id.toString(),
                    chargeType: 'retroactive_verification_fee',
                    description: 'Retroactive ₦10,000 verification charge'
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.status && response.data.data.status === 'success') {
            console.log(`✅ Charged successfully: ₦10,000`);
            console.log(`   Transaction: ${response.data.data.reference}`);
            
            // Mark as charged
            if (!subscription.metadata) {
                subscription.metadata = {};
            }
            subscription.metadata.retroactiveChargeCompleted = true;
            subscription.metadata.retroactiveChargeDate = new Date();
            subscription.metadata.retroactiveChargeReference = response.data.data.reference;
            await subscription.save();
            
            return {
                success: true,
                reference: response.data.data.reference,
                amount: CHARGE_AMOUNT
            };
        } else {
            console.log(`❌ Charge failed: ${response.data.message}`);
            console.log(`   Full response:`, JSON.stringify(response.data, null, 2));
            return {
                success: false,
                reason: 'charge_failed',
                message: response.data.message,
                fullResponse: response.data
            };
        }
    } catch (error) {
        console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
        if (error.response?.data) {
            console.log(`   Full error:`, JSON.stringify(error.response.data, null, 2));
        }
        return {
            success: false,
            reason: 'error',
            error: error.response?.data?.message || error.message,
            fullError: error.response?.data
        };
    }
}

// Main function to charge all existing cards
async function chargeAllExistingCards() {
    console.log('🚀 Starting retroactive charge process...\n');
    console.log(`💰 Charge Amount: ₦10,000 (${CHARGE_AMOUNT} kobo)\n`);
    
    try {
        // Find all subscriptions with payment methods
        const subscriptions = await Subscription.find({
            paymentProvider: 'paystack',
            paymentId: { $exists: true, $ne: null }
        }).populate('userId');

        console.log(`📊 Found ${subscriptions.length} subscriptions with payment methods\n`);
        console.log('─'.repeat(60));

        const results = {
            total: subscriptions.length,
            charged: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        
        for (const subscription of subscriptions) {
            if (!subscription.userId) {
                console.log(`⚠️  Skipped: User not found for subscription ${subscription._id}`);
                results.skipped++;
                continue;
            }

            const result = await chargeCard(subscription.userId, subscription);
            
            results.details.push({
                email: subscription.userId.email,
                userId: subscription.userId._id,
                ...result
            });

            if (result.success) {
                results.charged++;
            } else if (result.reason === 'already_charged' || result.reason === 'no_payment_method') {
                results.skipped++;
            } else {
                results.failed++;
            }

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Subscriptions: ${results.total}`);
        console.log(`✅ Successfully Charged: ${results.charged}`);
        console.log(`⚠️  Skipped: ${results.skipped}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`💰 Total Amount Charged: ₦${(results.charged * 10000).toLocaleString()}`);
        console.log('='.repeat(60));

        // Save detailed report
        const fs = require('fs');
        const reportPath = `charge-report-${Date.now()}.json`;
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);

        return results;
    } catch (error) {
        console.error('❌ Fatal error:', error);
        throw error;
    }
}

// Run the script
(async () => {
    try {
        await connectDB();
        
        // Confirmation prompt
        console.log('\n⚠️  WARNING: This will charge ALL existing cards ₦10,000');
        console.log('⚠️  Make sure you have proper authorization to do this!\n');
        
        // In production, you might want to add a confirmation step here
        // For now, we'll proceed automatically
        
        const results = await chargeAllExistingCards();
        
        console.log('\n✅ Process completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Process failed:', error);
        process.exit(1);
    }
})();
