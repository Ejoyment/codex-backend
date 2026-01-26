const nodemailer = require('nodemailer');

// Create transporter with better configuration
const createTransporter = () => {
    const config = {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        tls: {
            rejectUnauthorized: false // Allow self-signed certificates
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000
    };

    console.log('Email config:', {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user
    });

    return nodemailer.createTransport(config);
};

const transporter = createTransporter();

// Verify transporter configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('✗ Email service error:', error);
    } else {
        console.log('✓ Email service is ready');
    }
});

// Send OTP email
const sendOTPEmail = async (email, otp, fullName = 'User') => {
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
                    .button { background-color: #1e3a8a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
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
        console.error('✗ Email sending failed:', error);
        throw error;
    }
};

// Send welcome email
const sendWelcomeEmail = async (email, fullName) => {
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
        console.error('✗ Welcome email failed:', error);
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail
};
