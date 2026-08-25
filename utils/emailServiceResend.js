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
        subject: 'Verify Your Email - BuildrsHQ',
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
                        <h1>🚀 BuildrsHQ</h1>
                        <p>Enterprise Development Platform</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName}! 👋</h2>
                        <p>Thank you for signing up with BuildrsHQ! We're excited to have you on board.</p>
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
                            <strong>Need help?</strong> Contact our support team at support@buildrshq.com
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} BuildrsHQ</strong></p>
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
        from: process.env.EMAIL_FROM || 'BuildrsHQ <onboarding@resend.dev>',
        to: [email],
        subject: 'Welcome to BuildrsHQ! 🎉',
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
                        <h1>🎉 Welcome to BuildrsHQ!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName}!</h2>
                        <p>Your email has been successfully verified! Welcome to the BuildrsHQ Enterprise Development Platform.</p>
                        
                        <p>You now have access to:</p>
                        
                        <div class="features">
                            <div class="feature-item">AI-powered code assistance and pair programming</div>
                            <div class="feature-item">Real-time collaboration with your team</div>
                            <div class="feature-item">Integrated task and project management</div>
                            <div class="feature-item">GitHub, Discord, Slack, and more integrations</div>
                            <div class="feature-item">Advanced analytics and reporting</div>
                        </div>
                        
                        <p style="text-align: center;">
                            <a href="${process.env.FRONTEND_URL || 'https://buildrshq.dev'}/sign_in" class="button">
                                Sign In to Your Dashboard →
                            </a>
                        </p>
                        
                        <p style="margin-top: 30px;">
                            <strong>Need help getting started?</strong><br>
                            Check out our <a href="${process.env.FRONTEND_URL || 'https://buildrshq.dev'}/docs" style="color: #667eea;">documentation</a> or contact support at support@buildrshq.com
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} BuildrsHQ</strong></p>
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
    console.log('Subject: Verify Your Email - BuildrsHQ');
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

    const acceptUrl = `${process.env.FRONTEND_URL || 'https://buildrshq.dev'}/accept-invitation?token=${invitation.token}`;

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

// Send Trial Welcome Email
const sendTrialWelcomeEmail = async (email, fullName, trialEndsAt) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.log('Skipping trial welcome email - RESEND_API_KEY not configured');
        return { success: false, message: 'RESEND_API_KEY not configured' };
    }

    const trialEndDate = new Date(trialEndsAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const emailData = {
        from: process.env.EMAIL_FROM || 'BuildrsHQ <onboarding@resend.dev>',
        to: [email],
        subject: '🎉 Welcome to BuildrsHQ - Your 14-Day Free Trial Awaits!',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 40px 20px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
                    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
                    .content { padding: 40px 30px; }
                    .content h2 { margin-top: 0; color: #0f172a; }
                    .content p { margin-bottom: 16px; font-size: 15px; }
                    .trial-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
                    .trial-box .date { font-size: 24px; font-weight: 700; color: #0369a1; }
                    .trial-box .label { font-size: 13px; color: #0c4a6e; margin-top: 4px; }
                    .button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
                    .features-list { list-style: none; padding: 0; margin: 20px 0; }
                    .features-list li { padding: 10px 16px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; font-size: 14px; color: #475569; }
                    .features-list li span { color: #10b981; font-weight: 700; margin-right: 8px; }
                    .footer { background-color: #f8f9fa; text-align: center; padding: 30px 20px; border-top: 1px solid #e9ecef; }
                    .footer p { margin: 4px 0; font-size: 12px; color: #64748b; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to BuildrsHQ! 🎉</h1>
                        <p>Your 14-day free trial has started</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${fullName},</h2>
                        <p>Welcome to BuildrsHQ! We're excited to help you build, collaborate, and ship amazing software.</p>
                        
                        <div class="trial-box">
                            <div class="date">${trialEndDate}</div>
                            <div class="label">Your free trial ends on this date</div>
                        </div>
                        
                        <p>Your <strong>STARTER</strong> trial includes:</p>
                        <ul class="features-list">
                            <li><span>✓</span> Up to 10 projects</li>
                            <li><span>✓</span> Basic AI assistance</li>
                            <li><span>✓</span> 48-hour support response</li>
                            <li><span>✓</span> Limited API access</li>
                            <li><span>✓</span> Community support</li>
                        </ul>
                        
                        <p style="text-align: center;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5500'}/dashboard" class="button">Go to Dashboard →</a>
                        </p>
                        
                        <p style="color: #666; font-size: 13px; margin-top: 30px;">
                            Copy the link below to sign in:<br>
                            ${process.env.FRONTEND_URL || 'http://localhost:5500'}/sign_in
                        </p>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} BuildrsHQ</strong></p>
                        <p>Build, Collaborate, Ship.</p>
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
            console.log('✅ Trial welcome email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        } else {
            console.error('❌ Resend API error:', result);
            return { success: false, error: result.message || 'Failed to send email' };
        }
    } catch (error) {
        console.error('❌ Trial welcome email failed:', error.message);
        return { success: false, error: error.message };
    }
};

// Send Trial Reminder Email (last day)
const sendTrialReminderEmail = async (email, fullName, daysLeft) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.log('❌ RESEND_API_KEY not configured');
        return { success: false, message: 'RESEND_API_KEY not configured' };
    }

    const dayText = daysLeft === 1 ? 'last day' : `${daysLeft} days left`;
    const isLastDay = daysLeft <= 1;

    const emailData = {
        from: process.env.EMAIL_FROM || 'BuildrsHQ <billing@resend.dev>',
        to: [email],
        subject: isLastDay ? '⚠️ Your BuildrsHQ Trial Ends Today!' : `Your BuildrsHQ Trial Ends in ${daysLeft} Days`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: ${isLastDay ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'}; color: white; padding: 40px 20px; text-align: center; }
                    .header h1 { margin: 0; font-size: 26px; font-weight: 600; }
                    .content { padding: 40px 30px; text-align: center; }
                    .content p { margin: 16px 0; font-size: 15px; color: #475569; }
                    .days-left { font-size: 56px; font-weight: 800; color: ${isLastDay ? '#ef4444' : '#3b82f6'}; margin: 10px 0; }
                    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
                    .button-secondary { display: inline-block; background: white; color: #3b82f6; border: 2px solid #3b82f6; padding: 10px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
                    .footer { background-color: #f8f9fa; padding: 30px 20px; border-top: 1px solid #e9ecef; text-align: center; }
                    .footer > * { font-size: 12px; color: #64748b; margin: 4px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${isLastDay ? '⏰ Your Trial Ends Today!' : `⏰ Trial Ending Soon`}</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${fullName},</h2>
                        <p>Your BuildrsHQ free trial has <strong>${dayText}</strong> remaining.</p>
                        <div class="days-left">${daysLeft}</div>
                        ${isLastDay ? '<p>This is your <strong>last day</strong> to enjoy full Starter plan features, including up to 10 projects and basic AI assistance.</p>' : '<p>To continue enjoying Starter features after your trial, <strong>choose a plan</strong> that fits your needs.</p>'}
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5500'}/pricing" class="button">Upgrade Your Plan →</a>
                        <br><br>
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5500'}/dashboard" class="button">&nbsp;Continue to Dashboard&nbsp;</a>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} BuildrsHQ</strong></p>
                        <p>Build, innovate, ship.</p>
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
            console.log('✅ Trial reminder email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        } else {
            console.error('❌ Resend API error:', result);
            return { success: false, error: result.message || 'Failed to send email' };
        }
    } catch (error) {
        console.error('❌ Trial reminder email failed:', error.message);
        return { success: false, error: error.message };
    }
};

// Send Trial Expired Email
const sendTrialExpiredEmail = async (email, fullName) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
        console.log('Trial expired email - RESEND_API_KEY not configured');
        return { success: false, message: 'RESEND_API_KEY not configured' };
    }

    const emailData = {
        from: process.env.EMAIL_FROM || 'BuildrsHQ <billing@resend.dev>',
        to: [email],
        subject: 'Your BuildrsHQ Free Trial Has Ended',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 40px 20px; text-align: center; }
                    .header h1 { margin: 0; font-size: 26px; font-weight: 600; }
                    .content { padding: 40px 30px; text-align: center; }
                    .content p { margin: 16px 0; font-size: 15px; color: #475569; }
                    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
                    .footer { background-color: #f8f9fa; padding: 30px 20px; border-top: 1px solid #e9ecef; text-align: center; }
                    .footer > * { font-size: 12px; color: #64748b; margin: 4px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Trial Ended</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${fullName},</h2>
                        <p>Your 14-day free trial has ended.</p>
                        <p>You still have access to the <strong>Free</strong> tier with up to 3 projects and basic AI assistance.</p>
                        <p>Upgrade to <strong>Starter ($50/mo)</strong>, <strong>Professional ($99/mo)</strong>, or <strong>Enterprise ($299/mo)</strong> to unlock more features.</p>
                        
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5500'}/pricing" class="button">View Plans →</a>
                    </div>
                    <div class="footer">
                        <p><strong>© ${new Date().getFullYear()} BuildrsHQ</strong></p>
                        <p>Build, innovate, ship.</p>
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
            console.log('✅ Trial expired email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        } else {
            console.error('❌ Resend API error:', result);
            return { success: false, error: result.message || 'Failed to send email' };
        }
    } catch (error) {
        console.error('❌ Trial expired email failed:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendInvitationEmail,
    sendTrialWelcomeEmail,
    sendTrialReminderEmail,
    sendTrialExpiredEmail
};
