// Script to manually upgrade user to premium
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Subscription = require('./models/Subscription');

async function upgradeToPremium() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const email = process.argv[2];
        const tier = process.argv[3] || 'professional';

        if (!email) {
            console.log('Usage: node upgrade-to-premium.js <email> [tier]');
            console.log('Example: node upgrade-to-premium.js user@example.com professional');
            console.log('\nAvailable tiers: professional, enterprise');
            process.exit(1);
        }

        if (!['professional', 'enterprise'].includes(tier)) {
            console.log('❌ Invalid tier. Must be: professional or enterprise');
            process.exit(1);
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log(`❌ User not found: ${email}`);
            process.exit(1);
        }

        console.log('========================================');
        console.log('UPGRADING USER TO PREMIUM');
        console.log('========================================');
        console.log('User:', user.email);
        console.log('Name:', user.fullName);
        console.log('Target Tier:', tier);
        console.log('');

        let subscription = await Subscription.findOne({ userId: user._id });
        
        if (!subscription) {
            console.log('Creating new subscription...');
            subscription = new Subscription({ userId: user._id });
        } else {
            console.log('Current Tier:', subscription.tier);
            console.log('Current Status:', subscription.status);
            console.log('');
        }

        // Upgrade to new tier
        subscription.upgradeTo(tier);
        subscription.status = 'active';
        subscription.paymentProvider = 'manual';
        subscription.paymentId = `manual-${Date.now()}`;
        
        // Set end date (30 days from now)
        subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        await subscription.save();

        console.log('✅ UPGRADE SUCCESSFUL!');
        console.log('');
        console.log('New Subscription Details:');
        console.log('------------------------');
        console.log('Tier:', subscription.tier);
        console.log('Status:', subscription.status);
        console.log('Payment Provider:', subscription.paymentProvider);
        console.log('End Date:', subscription.endDate);
        console.log('');
        console.log('Features Unlocked:');
        subscription.features.forEach(feature => {
            console.log('  ✓', feature);
        });
        console.log('');
        console.log('Pricing:', subscription.pricing);
        console.log('========================================');
        console.log('');
        console.log('👉 Refresh your dashboard to see the changes!');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

upgradeToPremium();
