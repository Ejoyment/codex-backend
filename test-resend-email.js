// Test Resend Email Service
require('dotenv').config();
const { sendOTPEmail } = require('./utils/emailServiceResend');

console.log('\n========================================');
console.log('  TESTING RESEND EMAIL SERVICE');
console.log('========================================\n');

// Check environment variables
console.log('Environment Check:');
console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ NOT SET');
console.log('- EMAIL_FROM:', process.env.EMAIL_FROM || 'Using default');
console.log('');

// Test email sending
async function testEmail() {
    try {
        console.log('Sending test OTP email...\n');
        
        const result = await sendOTPEmail(
            'test@example.com',
            '1234',
            'Test User'
        );
        
        console.log('\n========================================');
        console.log('  TEST RESULT');
        console.log('========================================');
        console.log('Success:', result.success);
        console.log('Message ID:', result.messageId);
        console.log('Provider:', result.provider || 'mock');
        console.log('Is Mock:', result.isMock || false);
        console.log('========================================\n');
        
        if (result.isMock) {
            console.log('⚠️  WARNING: Email sent to console (mock mode)');
            console.log('⚠️  Add RESEND_API_KEY to environment variables\n');
        } else {
            console.log('✅ SUCCESS: Email sent via Resend API\n');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
}

testEmail();
