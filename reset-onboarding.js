// Script to reset onboarding status for testing
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function resetOnboarding() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Get email from command line argument
        const email = process.argv[2];

        if (!email) {
            console.log('\nUsage: node reset-onboarding.js <email>');
            console.log('Example: node reset-onboarding.js user@example.com\n');
            process.exit(1);
        }

        // Find user and reset onboarding
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log(`\n❌ User not found: ${email}\n`);
            process.exit(1);
        }

        // Reset onboarding status
        user.onboardingCompleted = false;
        user.role = [];
        user.company = '';
        user.teamSize = '';
        user.goals = [];
        await user.save();

        console.log(`\n✅ Onboarding reset for: ${user.email}`);
        console.log(`   Name: ${user.fullName}`);
        console.log(`   Onboarding Completed: ${user.onboardingCompleted}`);
        console.log('\n👉 Sign in again to see the onboarding flow!\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

resetOnboarding();
