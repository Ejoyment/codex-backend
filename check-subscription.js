// Script to check user's subscription
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Subscription = require('./models/Subscription');

async function checkSubscription() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const email = process.argv[2];
        if (!email) {
            console.log('Usage: node check-subscription.js <email>');
            process.exit(1);
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log(`User not found: ${email}`);
            process.exit(1);
        }

        console.log('========================================');
        console.log('SUBSCRIPTION CHECK');
        console.log('========================================');
        console.log('User:', user.email);
        console.log('Name:', user.fullName);
        console.log('\n--- SUBSCRIPTION DATA ---');

        const subscription = await Subscription.findOne({ userId: user._id });
        
        if (!subscription) {
            console.log('❌ No subscription found!');
            console.log('\nCreating default freebie subscription...');
            
            const newSub = await Subscription.create({
                userId: user._id,
                tier: 'freebie',
                status: 'active'
            });
            
            console.log('✅ Created freebie subscription');
            console.log('Tier:', newSub.tier);
            console.log('Status:', newSub.status);
        } else {
            console.log('Tier:', subscription.tier);
            console.log('Status:', subscription.status);
            console.log('Stripe Customer ID:', subscription.stripeCustomerId || 'None');
            console.log('Stripe Subscription ID:', subscription.stripeSubscriptionId || 'None');
            console.log('Current Period End:', subscription.currentPeriodEnd || 'N/A');
            console.log('Created:', subscription.createdAt);
            console.log('Updated:', subscription.updatedAt);
            
            console.log('\n--- RAW SUBSCRIPTION ---');
            console.log(JSON.stringify(subscription.toObject(), null, 2));
        }
        
        console.log('========================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSubscription();
