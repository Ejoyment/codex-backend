// Resend Email Service - Production Ready
// Fallback/duplicate of emailServiceResend.js, used by routes/invitations.js.
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

// --- Waitlist ---------------------------------------------------------------

// Shared Resend transport for waitlist mail (console mock when unconfigured)
const postToResend = async (emailData) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.log(`📧 [waitlist mock] to: ${emailData.to.join(', ')} | ${emailData.subject}`);
        return { success: true, messageId: 'mock-' + Date.now(), isMock: true };
    }

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
            console.log('✅ Waitlist email sent via Resend:', result.id);
            return { success: true, messageId: result.id };
        }

        console.error('❌ Resend API error:', result);
        return { success: false, error: result.message || 'Resend error' };
    } catch (error) {
        console.error('❌ Waitlist email failed:', error.message);
        return { success: false, error: error.message };
    }
};

// Thank-you mail sent the moment someone joins the waitlist
const sendWaitlistWelcomeEmail = async (email) => {
    const waitlistUrl = `${FRONTEND_URL}/#waitlist`;

    return postToResend({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: `You're on the ${BRAND_NAME} waitlist \u{1F389}`,
        html: renderEmail({
            eyebrow: 'buildrs · waitlist',
            title: 'Thank you for joining.',
            greeting: 'Hi there,',
            paragraphs: [
                `You\u2019re officially on the <strong>${BRAND_NAME}</strong> waitlist.`,
                'We\u2019ll email you the moment your seat is ready \u2014 no spam, no noise, just the launch note you signed up for.',
            ],
            info: {
                label: 'Your position is saved for:',
                value: email,
                accent: true,
            },
            cta: { url: waitlistUrl, label: 'See where you stand' },
            link: waitlistUrl,
        }),
    });
};

// Launch announcement mailed to every waitlist member on release day
const sendWaitlistReleaseEmail = async (email) => {
    const launchUrl = `${FRONTEND_URL}/sign_in`;

    return postToResend({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email],
        subject: `${BRAND_NAME} is live \u{1F680}`,
        html: renderEmail({
            eyebrow: 'buildrs · launch',
            title: 'We just shipped.',
            greeting: 'Hi there,',
            paragraphs: [
                `<strong>${BRAND_NAME}</strong> is officially open \u2014 and your waitlist seat got you in first.`,
                'Your account is ready: sign in and start building.',
            ],
            features: [
                'AI code assistance and pair programming',
                'Real-time collaboration with your team',
                'Deployments, sandboxes and pipelines',
            ],
            cta: { url: launchUrl, label: 'Open your workspace' },
            link: launchUrl,
        }),
    });
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendInvitationEmail,
    sendWaitlistWelcomeEmail,
    sendWaitlistReleaseEmail
};