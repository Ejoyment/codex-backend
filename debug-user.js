// Debug script to check user data
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function debugUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const email = process.argv[2];
        if (!email) {
            console.log('Usage: node debug-user.js <email>');
            process.exit(1);
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log(`User not found: ${email}`);
            process.exit(1);
        }

        console.log('========================================');
        console.log('USER DEBUG INFO');
        console.log('========================================');
        console.log('Email:', user.email);
        console.log('Name:', user.fullName);
        console.log('Verified:', user.isVerified);
        console.log('Auth Provider:', user.authProvider);
        console.log('\n--- ONBOARDING DATA ---');
        console.log('onboardingCompleted:', user.onboardingCompleted);
        console.log('Type:', typeof user.onboardingCompleted);
        console.log('Is exactly false:', user.onboardingCompleted === false);
        console.log('Is falsy:', !user.onboardingCompleted);
        console.log('Role:', user.role);
        console.log('Company:', user.company);
        console.log('Team Size:', user.teamSize);
        console.log('Goals:', user.goals);
        console.log('\n--- RAW DOCUMENT ---');
        console.log(JSON.stringify(user.toObject(), null, 2));
        console.log('========================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

debugUser();
