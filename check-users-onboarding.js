// Script to check all users' onboarding status
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkAllUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB\n');
        console.log('========================================');
        console.log('Checking All Users Onboarding Status');
        console.log('========================================\n');

        // Find all users
        const users = await User.find({}).select('email fullName onboardingCompleted role company teamSize isVerified');

        if (users.length === 0) {
            console.log('No users found in database.\n');
            process.exit(0);
        }

        console.log(`Found ${users.length} user(s):\n`);

        users.forEach((user, index) => {
            console.log(`${index + 1}. ${user.email}`);
            console.log(`   Name: ${user.fullName}`);
            console.log(`   Verified: ${user.isVerified ? '✅' : '❌'}`);
            console.log(`   Onboarding: ${user.onboardingCompleted === true ? '✅ Completed' : user.onboardingCompleted === false ? '❌ Not Completed' : '⚠️  Undefined/Null'}`);
            console.log(`   Role: ${user.role && user.role.length > 0 ? user.role.join(', ') : 'None'}`);
            console.log(`   Company: ${user.company || 'None'}`);
            console.log(`   Team Size: ${user.teamSize || 'None'}`);
            console.log('');
        });

        console.log('========================================');
        console.log('To reset a user\'s onboarding:');
        console.log('node reset-onboarding.js <email>');
        console.log('========================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAllUsers();
