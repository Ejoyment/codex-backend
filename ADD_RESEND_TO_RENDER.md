# Add Resend API Key to Render - Quick Guide

## Your Resend API Key
```
re_T82WSVo7_9wHc4X8FMdUAV95RBrEaA1eJ
```

## Step-by-Step Instructions

### 1. Go to Render Dashboard
Visit: https://dashboard.render.com

### 2. Select Your Service
- Click on `codex-backend-7utu` (or your backend service name)

### 3. Add Environment Variable
1. Click **"Environment"** in the left sidebar
2. Scroll down to "Environment Variables" section
3. Click **"Add Environment Variable"** button

### 4. Add Resend API Key
Add this variable:
- **Key**: `RESEND_API_KEY`
- **Value**: `re_T82WSVo7_9wHc4X8FMdUAV95RBrEaA1eJ`

### 5. Add Email From Address (Optional)
Add this variable:
- **Key**: `EMAIL_FROM`
- **Value**: `CODEX INC <onboarding@resend.dev>`

### 6. Save Changes
1. Click **"Save Changes"** button at the bottom
2. Render will automatically redeploy your service
3. Wait 2-3 minutes for deployment to complete

## Verify Deployment

### Check Logs
1. In Render dashboard, click **"Logs"** tab
2. Look for successful startup messages:
```
✅ OTP email sent via Resend: [message-id]
```

### Test Email Sending
1. Visit: https://codexincenterprise.online
2. Click "Sign Up"
3. Enter your email and details
4. Click "Sign Up"
5. Check your email inbox for OTP code
6. Enter OTP to verify

## Expected Behavior

### Success ✅
- OTP email arrives within seconds
- Email is from "CODEX INC <onboarding@resend.dev>"
- Email has beautiful HTML formatting
- Code is clearly visible

### If Email Doesn't Arrive
1. Check spam/junk folder
2. Check Render logs for errors
3. Verify API key is correct in Render environment variables
4. Check Resend dashboard: https://resend.com/emails

## Monitor Email Delivery

### Resend Dashboard
1. Go to: https://resend.com/emails
2. You'll see all sent emails with:
   - Recipient email
   - Subject
   - Status (Delivered/Failed)
   - Timestamp

### Render Logs
1. Go to Render dashboard
2. Click "Logs" tab
3. Filter for "email" or "OTP"
4. See real-time email sending logs

## Troubleshooting

### Error: "RESEND_API_KEY not configured"
**Solution**: Make sure you added the environment variable in Render and saved changes

### Error: "Failed to send email"
**Solution**: 
1. Check API key is correct
2. Check Resend dashboard for account status
3. Verify you haven't exceeded free tier limits (100/day)

### Emails Going to Spam
**Solution**: 
1. This is normal for `resend.dev` domain
2. To fix: Verify your own domain in Resend
3. Or ask recipients to mark as "Not Spam"

## Free Tier Limits

Resend Free Tier:
- ✅ 100 emails per day
- ✅ 3,000 emails per month
- ✅ All features included
- ✅ No credit card required

If you exceed limits:
- Upgrade to Pro: $20/month for 50,000 emails

## Alternative: Use Your Own Domain

For better deliverability, verify your domain:

1. In Resend dashboard, click "Domains"
2. Click "Add Domain"
3. Enter: `codexincenterprise.online`
4. Add DNS records to Spaceship
5. Wait for verification
6. Update `EMAIL_FROM` to: `CODEX INC <noreply@codexincenterprise.online>`

## Summary

✅ **What We Did**:
1. Created Resend account
2. Generated API key
3. Updated code to use Resend
4. Added API key to environment variables

✅ **What You Need to Do**:
1. Add `RESEND_API_KEY` to Render environment variables
2. Save changes (triggers auto-deploy)
3. Test email sending

✅ **Result**:
- Real OTP emails delivered to users
- No more console-only OTPs
- Production-ready email service
- Free for up to 3,000 emails/month

---

**Status**: Ready to deploy
**Time Required**: 5 minutes
**Difficulty**: Easy ⭐
