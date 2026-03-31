const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Subscription = require('./models/Subscription');

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected\n');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// Authorization codes from Paystack dashboard
const paystackPayments = [
    {
        email: 'krissdivine11@gmail.com',
        authCode: 'AUTH_7lyn78qn9n',
        reference: 'smp0s7uf7b',
        amount: 50,
        date: '12/02/2026'
    },
    {
        email: 'admin@codexincenterprise.online',
        authCode: 'AUTH_746v51j7mr',
        reference: '0mm8osadt9',
        amount: 50,
        date: '11/02/2026'
    },
    {
        email: 'admin@codexincenterprise.online',
        authCode: 'AUTH_9i2egzrcft',
        reference: 'w9obbnjeft',
        amount: 50,
        date: '10/02/2026'
    }
];

// Add authorization codes to database
async function addAuthorizationCodes() {
    console.log('🔧 Adding Paystack authorization codes to database...\n');
    console.log('='.repeat(60));
    
    try {
        let updated = 0;
        let skipped = 0;
        
        for (const payment of paystackPayments) {
            console.log(`\n📝 Processing: ${payment.email}`);
            console.log(`   Auth Code: ${payment.authCode}`);
            console.log(`   Reference: ${payment.reference}`);
            
            // Find user
            const user = await User.findOne({ email: payment.email });
            
            if (!user) {
                console.log(`   ⚠️  User not found - skipping`);
                skipped++;
                continue;
            }
            
            // Find or create subscription
            let subscription = await Subscription.findOne({ userId: user._id });
            
            if (!subscription) {
                console.log(`   ⚠️  No subscription found - skipping`);
                skipped++;
                continue;
            }
            
            // Check if already has Paystack auth code
            if (subscription.paymentProvider === 'paystack' && subscription.paymentId && !subscription.paymentId.startsWith('manual-')) {
                console.log(`   ⚠️  Already has Paystack auth code: ${subscription.paymentId}`);
                console.log(`   Skipping to avoid overwriting`);
                skipped++;
                continue;
            }
            
            // Update subscription with Paystack details
            subscription.paymentProvider = 'paystack';
            subscription.paymentId = payment.authCode;
            subscription.cardAddedAt = new Date(payment.date);
            subscription.isTrialWithCard = true;
            
            // Add metadata about the retroactive update
            if (!subscription.metadata) {
                subscription.metadata = {};
            }
            subscription.metadata.retroactiveAuthCodeAdded = true;
            subscription.metadata.retroactiveAuthCodeDate = new Date();
            subscription.metadata.originalPaymentReference = payment.reference;
            subscription.metadata.originalPaymentAmount = payment.amount;
            
            await subscription.save();
            
            console.log(`   ✅ Updated successfully!`);
            console.log(`   Provider: ${subscription.paymentProvider}`);
            console.log(`   Payment ID: ${subscription.paymentId}`);
            updated++;
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('\n📊 SUMMARY\n');
        console.log(`Total Payments: ${paystackPayments.length}`);
        console.log(`✅ Updated: ${updated}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log('='.repeat(60));
        
        if (updated > 0) {
            console.log('\n✅ Authorization codes added successfully!');
            console.log('\nNext step: Run charge-existing-cards.js to charge them ₦10,000');
        } else {
            console.log('\n⚠️  No subscriptions were updated');
            console.log('Check that users exist and have subscriptions');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// Run the script
(async () => {
    try {
        await connectDB();
        await addAuthorizationCodes();
        
        console.log('\n✅ Process complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Process failed:', error);
        process.exit(1);
    }
})();
