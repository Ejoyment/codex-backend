const nodemailer = require('nodemailer');

// Try to create real transporter
let transporter = null;
let useRealEmail = true;

const createTransporter = () => {
    try {
        const config = {
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT),
            secure: process.env.EMAIL_PORT === '465',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 5000
        };

        return nodemailer.createTransport(config);
    } catch (error) {
        console.error('Failed to create email transporter:', error.message);
        return null;
    }
};

// Initialize transporter
transporter = createTransporter();

// Test connection
if (transporter) {
    transporter.verify((error, success) => {
        if (error) {
            console.warn('⚠️  Email service unavailable:', error.message);
            console.warn('⚠️  Using MOCK mode - OTPs will be shown in console');
            useRealEmail = false;
        } else {
            console.log('✓ Email service is ready (Real emails will be sent)');
            useRealEmail = true;
        }
    });
} else {
    console.warn('⚠️  Email service unavailable - Using MOCK mode');
    useRealEmail = false;
}

// Send OTP email
const sendOTPEmail = async (email, otp, fullName = 'User') => {
    // If real email fails or is unavailable, use mock
    if (!useRealEmail || !transporter) {
        return sendMockOTP(email, otp, fullName);
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Verify Your Email - CODEX INC',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .otp-box { background-color: white; border: 2px solid #1e3a8a; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                    .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>CODEX INC</h1>
                        <p>Enterprise Portal</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName},</h2>
                        <p>Thank you for signing up with CODEX INC! To complete your registration, please verify your email address.</p>
                        
                        <div class="otp-box">
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">Your verification code is:</p>
                            <div class="otp-code">${otp}</div>
                        </div>
                        
                        <p>This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
                        <p>If you didn't request this code, please ignore this email.</p>
                        
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} CODEX INC. All rights reserved.</p>
                            <p>This is an automated email, please do not reply.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✓ Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('✗ Email sending failed:', error.message);
        console.warn('⚠️  Falling back to MOCK mode');
        useRealEmail = false;
        return sendMockOTP(email, otp, fullName);
    }
};

// Mock email sender (for when SMTP is blocked)
const sendMockOTP = (email, otp, fullName) => {
    console.log('\n========================================');
    console.log('📧 EMAIL SENT (MOCK MODE - SMTP BLOCKED)');
    console.log('========================================');
    console.log('To:', email);
    console.log('Subject: Verify Your Email - CODEX INC');
    console.log('----------------------------------------');
    console.log(`Hello ${fullName},`);
    console.log('');
    console.log('Your verification code is:');
    console.log('');
    console.log(`    🔑 ${otp} 🔑`);
    console.log('');
    console.log(`This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`);
    console.log('========================================');
    console.log('⚠️  NOTE: Real email could not be sent.');
    console.log('⚠️  This is likely due to firewall/antivirus blocking SMTP.');
    console.log('⚠️  Use the code above to test the system.');
    console.log('========================================\n');

    return { success: true, messageId: 'mock-' + Date.now(), isMock: true };
};

// Send welcome email
const sendWelcomeEmail = async (email, fullName) => {
    if (!useRealEmail || !transporter) {
        console.log(`\n✓ Welcome email (mock) sent to: ${fullName} (${email})\n`);
        return { success: true };
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Welcome to CODEX INC!',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { background-color: #1e3a8a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to CODEX INC!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName},</h2>
                        <p>Your email has been successfully verified! Welcome to the CODEX INC Enterprise Portal.</p>
                        <p>You can now access all features of your account.</p>
                        <a href="${process.env.FRONTEND_URL}/sign_in.html" class="button">Sign In Now</a>
                        <p>If you have any questions, feel free to contact our support team.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✓ Welcome email sent to:', email);
    } catch (error) {
        console.error('✗ Welcome email failed:', error.message);
        console.log(`✓ Welcome email (mock) sent to: ${fullName} (${email})`);
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail
};
