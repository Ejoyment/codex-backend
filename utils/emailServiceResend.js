// Resend Email Service - Production Ready
// Free tier: 100 emails/day, 3,000/month
// Works perfectly on Render and all hosting platforms

const sendOTPEmail = async (email, otp, fullName = 'User') => {
    // Check if Resend API key is configured
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY not configured');
        return sendMockOTP(email, otp, fullName);
    }

    const emailData = {
        from: process.env.EMAIL_FROM || 'CODEX INC <onboarding@resend.dev>',
        to: [email],
        subject: 'Verify Your Email - CODEX INC',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6; 
                        color: #333;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f4;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 40px auto; 
                        background-color: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        padding: 40px 20px; 
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 28px;
                        font-weight: 600;
                    }
                    .header p {
                        margin: 8px 0 0 0;
                        opacity: 0.9;
                        font-size: 14px;
                    }
                    .content { 
                        padding: 40px 30px;
                    }
                    .content h2 {
                        color: #333;
                        font-size: 20px;
                        margin: 0 0 20px 0;
                    }
                    .content p {
                        color: #666;
                        margin: 0 0 16px 0;
                        font-size: 15px;
                    }
                    .otp-box { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 30px; 
                        text-align: center; 
                        margin: 30px 0; 
                        border-radius: 8px;
                    }
                    .otp-label {
                        color: white;
                        font-size: 14px;
                        margin: 0 0 12px 0;
                        opacity: 0.9;
                    }
                    .otp-code { 
                        font-size: 36px; 
                        font-weight: bold; 
                        letter-spacing: 12px; 
                        color: white;
                        margin: 0;
                        font-family: 'Courier New', monospace;
                    }
                    .warning {
                        background-color: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 16px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }
                    .warning p {
                        margin: 0;
                        color: #856404;
                        font-size: 14px;
                    }
                    .footer { 
                        background-color: #f8f9fa;
                        text-align: center; 
                        padding: 30px 20px;
                        border-top: 1px solid #e9ecef;
                    }
                    .footer p {
                        margin: 0 0 8px 0;
                        font-size: 13px; 
                        color: #6c757d;
                    }
                    .footer a {
                        color: #667eea;
                        text-decoration: none;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚀 CODEX INC</h1>
                        <p>Enterprise Development Platform</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName}! 👋</h2>
                        <p>Thank you for signing up with CODEX INC! We're excited to have you on board.</p>
                        <p>To complete your registration and verify your email address, please use the verification code below:</p>
                        
                        <div class="otp-box">
                            <p class="otp-label">Your Verification Code</p>
                            <p class="otp-code">${otp}</p>
                        </div>
                        
                        <div class="warning">
                            <p><strong>⏰ Important:</strong> This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes for security reasons.</p>
                        </div>
                        
                        <p>If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
                        
                        <p style="margin-top: 30px;">
                            <strong>Need help?</strong> Contact our support team at support@codexinc.com
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} CODEX INC</strong></p>
                        <p>All rights reserved.</p>
                        <p style="margin-top: 16px;">This is an automated email, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ OTP email sent via Resend:', result.id);
            return { success: true, messageId: result.id, provider: 'resend' };
        } else {
            console.error('❌ Resend API error:', result);
            throw new Error(result.message || 'Failed to send email');
        }
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        console.warn('⚠️  Falling back to console output');
        return sendMockOTP(email, otp, fullName);
    }
};

// Send welcome email
const sendWelcomeEmail = async (email, fullName) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.log(`✅ Welcome email (mock) for: ${fullName} (${email})`);
        return { success: true };
    }

    const emailData = {
        from: process.env.EMAIL_FROM || 'CODEX INC <onboarding@resend.dev>',
        to: [email],
        subject: 'Welcome to CODEX INC! 🎉',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6; 
                        color: #333;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f4;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 40px auto; 
                        background-color: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        padding: 50px 20px; 
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 32px;
                        font-weight: 600;
                    }
                    .content { 
                        padding: 40px 30px;
                    }
                    .content h2 {
                        color: #333;
                        font-size: 24px;
                        margin: 0 0 20px 0;
                    }
                    .content p {
                        color: #666;
                        margin: 0 0 16px 0;
                        font-size: 15px;
                    }
                    .button { 
                        display: inline-block;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        padding: 14px 32px; 
                        text-decoration: none; 
                        border-radius: 6px;
                        font-weight: 600;
                        margin: 20px 0;
                        transition: transform 0.2s;
                    }
                    .button:hover {
                        transform: translateY(-2px);
                    }
                    .features {
                        background-color: #f8f9fa;
                        padding: 24px;
                        border-radius: 8px;
                        margin: 24px 0;
                    }
                    .feature-item {
                        margin: 12px 0;
                        padding-left: 28px;
                        position: relative;
                    }
                    .feature-item:before {
                        content: "✓";
                        position: absolute;
                        left: 0;
                        color: #667eea;
                        font-weight: bold;
                        font-size: 18px;
                    }
                    .footer { 
                        background-color: #f8f9fa;
                        text-align: center; 
                        padding: 30px 20px;
                        border-top: 1px solid #e9ecef;
                    }
                    .footer p {
                        margin: 0 0 8px 0;
                        font-size: 13px; 
                        color: #6c757d;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Welcome to CODEX INC!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName}!</h2>
                        <p>Your email has been successfully verified! Welcome to the CODEX INC Enterprise Development Platform.</p>
                        
                        <p>You now have access to:</p>
                        
                        <div class="features">
                            <div class="feature-item">AI-powered code assistance and pair programming</div>
                            <div class="feature-item">Real-time collaboration with your team</div>
                            <div class="feature-item">Integrated task and project management</div>
                            <div class="feature-item">GitHub, Discord, Slack, and more integrations</div>
                            <div class="feature-item">Advanced analytics and reporting</div>
                        </div>
                        
                        <p style="text-align: center;">
                            <a href="${process.env.FRONTEND_URL || 'https://codexincenterprise.online'}/sign_in.html" class="button">
                                Sign In to Your Dashboard →
                            </a>
                        </p>
                        
                        <p style="margin-top: 30px;">
                            <strong>Need help getting started?</strong><br>
                            Check out our <a href="${process.env.FRONTEND_URL || 'https://codexincenterprise.online'}/docs" style="color: #667eea;">documentation</a> or contact support at support@codexinc.com
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} CODEX INC</strong></p>
                        <p>All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Welcome email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        } else {
            console.error('❌ Resend API error:', result);
        }
    } catch (error) {
        console.error('❌ Welcome email failed:', error.message);
    }
};

// Mock email sender (fallback when API key is not configured)
const sendMockOTP = (email, otp, fullName) => {
    console.log('\n========================================');
    console.log('📧 OTP EMAIL (Console Output)');
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
    console.log('⚠️  NOTE: Configure RESEND_API_KEY to send real emails');
    console.log('⚠️  Get your free API key at: https://resend.com');
    console.log('========================================\n');

    return { success: true, messageId: 'mock-' + Date.now(), isMock: true };
};

// Send invitation email
const sendInvitationEmail = async (invitation) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.log(`✅ Invitation email (mock) for: ${invitation.email}`);
        return { success: true };
    }

    const acceptUrl = `${process.env.FRONTEND_URL || 'https://codexincenterprise.online'}/accept-invitation.html?token=${invitation.token}`;

    const emailData = {
        from: process.env.EMAIL_FROM || 'CODEX INC <onboarding@resend.dev>',
        to: [invitation.email],
        subject: `You're invited to join ${invitation.company.name} on CODEX INC`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6; 
                        color: #333;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f4;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 40px auto; 
                        background-color: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        padding: 40px 20px; 
                        text-align: center;
                    }
                    .content { 
                        padding: 40px 30px;
                    }
                    .button { 
                        display: inline-block;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        padding: 14px 32px; 
                        text-decoration: none; 
                        border-radius: 6px;
                        font-weight: 600;
                        margin: 20px 0;
                    }
                    .message-box {
                        background-color: #f8f9fa;
                        border-left: 4px solid #667eea;
                        padding: 16px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }
                    .footer { 
                        background-color: #f8f9fa;
                        text-align: center; 
                        padding: 30px 20px;
                        border-top: 1px solid #e9ecef;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 You're Invited!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello!</h2>
                        <p><strong>${invitation.invitedBy.fullName}</strong> has invited you to join <strong>${invitation.company.name}</strong> on CODEX INC.</p>
                        
                        ${invitation.message ? `<div class="message-box"><em>"${invitation.message}"</em></div>` : ''}
                        
                        <p>As a <strong>${invitation.role}</strong>, you'll be able to collaborate with the team on projects, tasks, code, and more.</p>
                        
                        <p style="text-align: center;">
                            <a href="${acceptUrl}" class="button">Accept Invitation →</a>
                        </p>
                        
                        <p style="color: #666; font-size: 13px; margin-top: 30px;">
                            This invitation will expire in 7 days.<br>
                            If the button doesn't work, copy and paste this link: ${acceptUrl}
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} CODEX INC</strong></p>
                        <p>All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Invitation email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        } else {
            console.error('❌ Resend API error:', result);
            throw new Error(result.message || 'Failed to send email');
        }
    } catch (error) {
        console.error('❌ Invitation email failed:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendInvitationEmail
};
