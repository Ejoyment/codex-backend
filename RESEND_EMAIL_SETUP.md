# Resend Email Service Setup Guide

## Why Resend?

Resend is the perfect email service for production because:
- ✅ **FREE Tier**: 100 emails/day, 3,000/month
- ✅ **Works on Render**: No SMTP port restrictions
- ✅ **Fast & Reliable**: Built for developers
- ✅ **Easy Setup**: Just one API key needed
- ✅ **Beautiful Emails**: Modern HTML templates
- ✅ **No Credit Card**: Free tier doesn't require payment info

## Step 1: Create Resend Account

1. Go to https://resend.com
2. Click "Sign Up" (top right)
3. Sign up with your email or GitHub
4. Verify your email address

## Step 2: Get Your API Key

1. After logging in, you'll see the dashboard
2. Click on "API Keys" in the left sidebar
3. Click "Create API Key"
4. Give it a name: `CODEX INC Production`
5. Select permission: `Sending access`
6. Click "Create"
7. **IMPORTANT**: Copy the API key immediately (you won't see it again!)
   - It looks like: `re_123abc456def789ghi012jkl345mno678`

## Step 3: Add API Key to Render

### Option A: Via Render Dashboard (Recommended)

1. Go to https://dashboard.render.com
2. Select your `codex-backend` service
3. Click "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add:
   - **Key**: `RESEND_API_KEY`
   - **Value**: `re_your_api_key_here` (paste the key you copied)
6. Click "Save Changes"
7. Render will automatically redeploy your service

### Option B: Via .env File (Local Testing)

Add to your `.env` file:
```env
RESEND_API_KEY=re_your_api_key_here
```

## Step 4: Configure Email From Address

### Option 1: Use Resend's Test Domain (Quick Start)

No setup needed! Resend provides a test domain:
```env
EMAIL_FROM=CODEX INC <onboarding@resend.dev>
```

**Limitations**:
- Emails may go to spam
- Can only send to verified email addresses
- Not recommended for production

### Option 2: Use Your Own Domain (Recommended for Production)

1. In Resend dashboard, click "Domains"
2. Click "Add Domain"
3. Enter your domain: `codexincenterprise.online`
4. Resend will show DNS records to add
5. Add these DNS records in your domain provider (Spaceship):

```
Type: TXT
Name: @
Value: [Resend will provide this]

Type: MX
Name: @
Value: [Resend will provide this]
Priority: 10

Type: TXT
Name: resend._domainkey
Value: [Resend will provide this - DKIM record]
```

6. Wait 24-48 hours for DNS propagation
7. Click "Verify" in Resend dashboard
8. Once verified, update your `.env`:

```env
EMAIL_FROM=CODEX INC <noreply@codexincenterprise.online>
```

## Step 5: Test Email Sending

### Test Locally

1. Make sure `.env` has `RESEND_API_KEY`
2. Run your server: `npm start`
3. Try signing up with your email
4. Check your inbox for the OTP email

### Test on Render

1. After adding `RESEND_API_KEY` to Render environment variables
2. Wait for automatic redeployment (2-3 minutes)
3. Visit https://codexincenterprise.online
4. Try signing up
5. Check your inbox

## Step 6: Monitor Email Delivery

1. Go to Resend dashboard
2. Click "Emails" in sidebar
3. You'll see all sent emails with status:
   - ✅ **Delivered**: Email successfully sent
   - ⏳ **Queued**: Email is being processed
   - ❌ **Failed**: Email failed to send (check logs)

## Troubleshooting

### Emails Not Sending

**Check 1: API Key Configured**
```bash
# On Render, check environment variables
# Make sure RESEND_API_KEY is set
```

**Check 2: Check Render Logs**
```bash
# In Render dashboard, click "Logs"
# Look for:
✅ OTP email sent via Resend: [message-id]
# Or errors:
❌ Resend API error: [error message]
```

**Check 3: Verify Email Format**
```javascript
// Make sure EMAIL_FROM is in correct format:
EMAIL_FROM=CODEX INC <onboarding@resend.dev>
// NOT just: onboarding@resend.dev
```

### Emails Going to Spam

**Solution 1: Verify Your Domain**
- Follow Step 4, Option 2 above
- Add all DNS records (SPF, DKIM, MX)
- Wait for verification

**Solution 2: Warm Up Your Domain**
- Start by sending to yourself
- Gradually increase volume
- Ask recipients to mark as "Not Spam"

**Solution 3: Improve Email Content**
- Avoid spam trigger words
- Include unsubscribe link
- Use proper HTML structure

### Rate Limit Exceeded

Free tier limits:
- 100 emails/day
- 3,000 emails/month

**Solutions**:
1. Upgrade to paid plan ($20/month for 50,000 emails)
2. Implement email queuing
3. Use multiple providers (fallback)

## Environment Variables Summary

Add these to Render:

```env
# Required
RESEND_API_KEY=re_your_api_key_here

# Optional (defaults to resend.dev)
EMAIL_FROM=CODEX INC <onboarding@resend.dev>

# Or with your domain (after verification)
EMAIL_FROM=CODEX INC <noreply@codexincenterprise.online>
```

## Code Changes Made

### Files Updated:
1. ✅ `utils/emailServiceResend.js` - New Resend email service
2. ✅ `routes/otp.js` - Updated to use Resend service

### Files NOT Changed (Backup):
- `utils/emailService.js` - Original Gmail SMTP (kept as backup)
- `utils/emailServiceSmart.js` - Smart fallback service (kept as backup)

## Testing Checklist

- [ ] Resend account created
- [ ] API key generated and copied
- [ ] API key added to Render environment variables
- [ ] Render service redeployed
- [ ] Test signup on live site
- [ ] OTP email received in inbox
- [ ] Email looks good (not in spam)
- [ ] Welcome email received after verification
- [ ] Check Resend dashboard for delivery status

## Fallback Behavior

If Resend API key is not configured:
- System will output OTP to console logs
- You can see OTP in Render logs
- Useful for testing without email service

To see console OTP:
1. Go to Render dashboard
2. Click "Logs"
3. Look for:
```
========================================
📧 OTP EMAIL (Console Output)
========================================
To: user@example.com
Your verification code is:
    🔑 1234 🔑
========================================
```

## Cost Breakdown

### Free Tier (Perfect for Starting)
- 100 emails/day
- 3,000 emails/month
- All features included
- No credit card required

### Paid Plans (When You Scale)
- **Pro**: $20/month - 50,000 emails
- **Business**: $80/month - 250,000 emails
- **Enterprise**: Custom pricing

## Alternative Email Services

If you need alternatives:

1. **SendGrid** (Free: 100 emails/day)
   - More complex setup
   - Requires domain verification

2. **Mailgun** (Free: 5,000 emails/month)
   - Good for high volume
   - More expensive after free tier

3. **Amazon SES** (Free: 62,000 emails/month on AWS)
   - Requires AWS account
   - More complex setup

4. **Postmark** (Free trial: 100 emails)
   - Great deliverability
   - No free tier

**Recommendation**: Stick with Resend - it's the easiest and most developer-friendly!

## Support

- **Resend Docs**: https://resend.com/docs
- **Resend Discord**: https://resend.com/discord
- **Email**: support@resend.com

---

**Status**: Ready to implement
**Estimated Setup Time**: 10 minutes
**Difficulty**: Easy ⭐
