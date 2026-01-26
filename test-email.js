// Quick Email Test Script
require('dotenv').config();
const { sendOTPEmail } = require('./utils/emailServiceSmart');

console.log('========================================');
console.log('Testing Email Service');
console.log('========================================\n');

console.log('Configuration:');
console.log('- Host:', process.env.EMAIL_HOST);
console.log('- Port:', process.env.EMAIL_PORT);
console.log('- User:', process.env.EMAIL_USER);
console.log('- Password:', process.env.EMAIL_PASSWORD ? '***' + process.env.EMAIL_PASSWORD.slice(-4) : 'NOT SET');
console.log('\n');

console.log('Sending test OTP...\n');

sendOTPEmail('test@example.com', '1234', 'Test User')
    .then(result => {
        console.log('\n✅ Test completed!');
        if (result.isMock) {
            console.log('⚠️  SMTP is blocked - Using MOCK mode');
            console.log('💡 This is fine for testing!');
            console.log('💡 OTP codes will appear in console when users sign up.');
        } else {
            console.log('✅ Real email service is working!');
            console.log('✅ Emails will be sent to users.');
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    });
