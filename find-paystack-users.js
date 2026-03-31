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

// Find users who paid with Paystack
async function findPaystackUsers() {
    console.log('🔍 Searching for users who paid with Paystack...\n');
    console.log('='.repeat(60));
    
    try {
        // Find ALL subscriptions with paymentId (regardless of provider)
        const subsWithPayment = await Subscription.find({
            paymentId: { $exists: true, $ne: null }
        }).populate('userId');
        
        console.log(`\n📊 Found ${subsWithPayment.length} subscriptions with paymentId:\n`);
        
        const paystackUsers = [];
        
        for (const sub of subsWithPayment) {
            console.log(`\n${paystackUsers.length + 1}. Subscription ID: ${sub._id}`);
            console.log(`   User: ${sub.userId?.email || 'No user'}`);
            console.log(`   Payment Provider: ${sub.paymentProvider}`);
            console.log(`   Payment ID: ${sub.paymentId}`);
            console.log(`   Customer ID: ${sub.customerId || 'None'}`);
            console.log(`   Card Added: ${sub.cardAddedAt || 'No'}`);
            console.log(`   Trial with Card: ${sub.isTrialWithCard || false}`);
            console.log(`   Tier: ${sub.tier}`);
            console.log(`   Status: ${sub.status}`);
            
            // Check if paymentId looks like a Paystack authorization code
            // Paystack auth codes typically start with "AUTH_" or are long alphanumeric strings
            const isPaystackAuth = sub.paymentId && 
                                   !sub.paymentId.startsWith('manual-') &&
                                   sub.paymentId.length > 20;
            
            if (isPaystackAuth) {
                console.log(`   ✅ LOOKS LIKE PAYSTACK AUTH CODE!`);
                paystackUsers.push({
                    subscriptionId: sub._id,
                    userId: sub.userId?._id,
                    email: sub.userId?.email,
                    authCode: sub.paymentId,
                    customerId: sub.customerId,
                    tier: sub.tier,
                    status: sub.status
                });
            } else {
                console.log(`   ⚠️  Not a Paystack auth code (manual or invalid)`);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`\n🎯 PAYSTACK USERS TO CHARGE: ${paystackUsers.length}\n`);
        
        if (paystackUsers.length > 0) {
            paystackUsers.forEach((user, index) => {
                console.log(`${index + 1}. ${user.email}`);
                console.log(`   Auth Code: ${user.authCode}`);
                console.log(`   Customer ID: ${user.customerId || 'None'}`);
                console.log(`   Tier: ${user.tier}`);
            });
        } else {
            console.log('⚠️  No Paystack users found!');
            console.log('\nPossible reasons:');
            console.log('1. Users paid but authorization codes were not saved');
            console.log('2. Authorization codes are stored elsewhere');
            console.log('3. Payment verification step failed to save auth codes');
        }
        
        return paystackUsers;
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// Run the script
(async () => {
    try {
        await connectDB();
        const paystackUsers = await findPaystackUsers();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Search complete!');
        console.log(`Found ${paystackUsers.length} users with Paystack payment methods`);
        console.log('='.repeat(60));
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Search failed:', error);
        process.exit(1);
    }
})();
