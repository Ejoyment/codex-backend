// Resend Email Service - Production Ready
// Free tier: 100 emails/day, 3,000/month
// Works on Render and all hosting platforms.
// All templates render through utils/emailLayout.js for a consistent
// BuildrsHQ brand look (near-black + teal) with the logo present.

const { renderEmail, BRAND_NAME, FRONTEND_URL } = require('./emailLayout');

const DEFAULT_FROM = 'BuildrsHQ <onboarding@resend.dev>';

// Mock email sender (console fallback when the API key is not configured)
const sendMockOTP = (email, otp, fullName) => {
    console.log('\n========================================');
    console.log('📧 OTP EMAIL (Console Output)');
    console.log('========================================');
    console.log('To:', email);
    console.log('Subject: Your BuildrsHQ verification code');
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

// Send OTP verification email
const sendOTPEmail = async (email, otp, fullName = 'User') => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY not configured');
        return sendMockOTP(email, otp, fullName);
    }

    const emailData = {
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: 'Your BuildrsHQ verification code',
        html: renderEmail({
            eyebrow: 'buildrs · verification',
            title: `Hi ${fullName},`,
            paragraphs: [
                'Welcome to <strong>BuildrsHQ</strong>. Use the code below to verify your email address and activate your account.',
            ],
            code: otp,
            codeLabel: 'Verification code',
            info: {
                label: `Code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Never share this code.`,
            },
            paragraphsAfter: [
                'If you did not request this code, you can safely ignore this email.',
            ],
        }),
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

    const signInUrl = `${FRONTEND_URL}/sign_in`;

    const emailData = {
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: 'Welcome to BuildrsHQ',
        html: renderEmail({
            eyebrow: 'buildrs · welcome',
            title: "You're in.",
            greeting: `Hi ${fullName},`,
            paragraphs: [
                'Your email is verified and your <strong>BuildrsHQ</strong> workspace is live. Here\u2019s what\u2019s ready for you:',
            ],
            features: [
                'AI code assistance and pair programming',
                'Real-time collaboration with your team',
                'Task, project and standup management',
                'GitHub, Slack, Discord and more integrations',
                'Analytics and reporting',
            ],
            cta: { url: signInUrl, label: 'Sign in to your dashboard' },
            link: signInUrl,
        }),
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

// Send invitation email
const sendInvitationEmail = async (invitation) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.log(`✅ Invitation email (mock) for: ${invitation.email}`);
        return { success: true };
    }

    const acceptUrl = `${FRONTEND_URL}/accept-invitation?token=${invitation.token}`;
    const companyName = invitation.company?.name || 'a workspace';
    const invitedBy = invitation.invitedBy?.fullName || 'A teammate';

    const emailData = {
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [invitation.email],
        subject: `You're invited to join ${companyName} on ${BRAND_NAME}`,
        html: renderEmail({
            eyebrow: 'buildrs · invitation',
            title: 'Join',
            titleWrap: `${companyName} on ${BRAND_NAME}`,
            greeting: 'Hello,',
            paragraphs: [
                `<strong>${invitedBy}</strong> has invited you to join <strong>${companyName}</strong> on BuildrsHQ.`,
                `As a <strong>${invitation.role}</strong>, you\u2019ll collaborate on projects, tasks, code and standups with the whole team.`,
            ],
            quote: invitation.message,
            info: {
                label: 'Your seat on the workspace:',
                value: `${invitation.role}`,
                accent: true,
            },
            cta: { url: acceptUrl, label: 'Accept invitation' },
            link: acceptUrl,
        }),
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

    const dashboardUrl = `${FRONTEND_URL}/dashboard`;

    const emailData = {
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: 'Your 14-day BuildrsHQ trial has started',
        html: renderEmail({
            eyebrow: 'buildrs · plan',
            title: 'Welcome to your free trial',
            greeting: `Hi ${fullName},`,
            paragraphs: [
                'Thanks for trying <strong>BuildrsHQ</strong>. You have 14 days to explore everything we\u2019ve built — at no cost.',
            ],
            info: {
                label: 'Trial ends on',
                value: trialEndDate,
                accent: true,
            },
            paragraphsAfter: [
                'Your <strong>Starter</strong> trial includes:',
            ],
            features: [
                'Up to 10 projects',
                'Basic AI assistance',
                '48-hour support response',
                'Limited API access',
                'Community support',
            ],
            cta: { url: dashboardUrl, label: 'Go to your dashboard' },
            link: `${FRONTEND_URL}/sign_in`,
        }),
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
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: isLastDay ? 'Your BuildrsHQ trial ends today' : `Your BuildrsHQ trial ends in ${daysLeft} days`,
        html: renderEmail({
            eyebrow: 'buildrs · plan',
            title: isLastDay ? 'Your trial ends today' : 'Your trial ends in',
            titleWrap: isLastDay ? undefined : `${daysLeft} days`,
            greeting: `Hi ${fullName},`,
            paragraphs: [
                `Your <strong>BuildrsHQ</strong> free trial has <strong>${dayText}</strong> remaining.`,
                isLastDay
                    ? 'This is your <strong>last day</strong> to enjoy full Starter plan features, including up to 10 projects and basic AI assistance.'
                    : 'Choose a plan now to keep enjoying Starter features after your trial ends.',
            ],
            code: String(daysLeft),
            codeLabel: 'Days remaining',
            cta: { url: `${FRONTEND_URL}/pricing`, label: 'Choose a plan' },
            link: `${FRONTEND_URL}/dashboard`,
        }),
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
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: 'Your BuildrsHQ free trial has ended',
        html: renderEmail({
            eyebrow: 'buildrs · plan',
            title: 'Your free trial has ended',
            greeting: `Hi ${fullName},`,
            paragraphs: [
                'Your 14-day free trial is over — you\u2019re now on the <strong>Free</strong> tier with up to 3 projects and basic AI assistance.',
                'Upgrade to keep building without limits:',
            ],
            features: [
                'Starter — $50/mo',
                'Professional — $99/mo',
                'Enterprise — $299/mo',
            ],
            cta: { url: `${FRONTEND_URL}/pricing`, label: 'View plans' },
        }),
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