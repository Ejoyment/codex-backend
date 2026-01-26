// Mock Email Service for Testing (when SMTP is blocked)
// This simulates sending emails by logging them to console

const sendOTPEmail = async (email, otp, fullName = 'User') => {
    console.log('\n========================================');
    console.log('📧 EMAIL SENT (MOCK MODE)');
    console.log('========================================');
    console.log('To:', email);
    console.log('Subject: Verify Your Email - CODEX INC');
    console.log('----------------------------------------');
    console.log(`Hello ${fullName},`);
    console.log('');
    console.log('Your verification code is:');
    console.log('');
    console.log(`    >>> ${otp} <<<`);
    console.log('');
    console.log(`This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`);
    console.log('========================================\n');

    return { success: true, messageId: 'mock-' + Date.now() };
};

const sendWelcomeEmail = async (email, fullName) => {
    console.log('\n========================================');
    console.log('📧 WELCOME EMAIL SENT (MOCK MODE)');
    console.log('========================================');
    console.log('To:', email);
    console.log('Subject: Welcome to CODEX INC!');
    console.log('----------------------------------------');
    console.log(`Hello ${fullName},`);
    console.log('');
    console.log('Your email has been successfully verified!');
    console.log('Welcome to the CODEX INC Enterprise Portal.');
    console.log('========================================\n');

    return { success: true };
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail
};
