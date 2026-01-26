# Quick Start: Payment & Integrations

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies (Already Done!)
```bash
npm install stripe axios
```
✅ Stripe and Axios are already installed!

### Step 2: Set Up Stripe (Test Mode)

1. **Sign up for Stripe**: [https://stripe.com](https://stripe.com)

2. **Get your test keys**:
   - Go to Developers → API keys
   - Copy "Secret key" (starts with `sk_test_`)
   - Copy "Publishable key" (starts with `pk_test_`)

3. **Create a product**:
   - Go to Products → Add Product
   - Name: "Professional Monthly"
   - Price: $25/month, recurring monthly
   - Copy the Price ID (starts with `price_`)

4. **Set up webhook**:
   - Go to Developers → Webhooks → Add endpoint
   - URL: `http://localhost:3000/api/subscription/webhook/stripe`
   - Events: Select all `checkout.*`, `customer.subscription.*`, `invoice.*`
   - Copy Webhook Secret (starts with `whsec_`)

5. **Update your .env file**:
```env
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
STRIPE_PROFESSIONAL_PRICE_ID=price_your_price_id_here
BACKEND_URL=http://localhost:3000
```

### Step 3: Test Payment Flow

1. **Start backend**:
```bash
start-backend.bat
```

2. **Sign in** to your account

3. **Go to Pricing page**

4. **Click "Upgrade Now"** on Professional tier

5. **Use test card**:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - ZIP: Any 5 digits (e.g., 12345)

6. **Complete payment**

7. **You'll be redirected** to success page

8. **Check your dashboard** - Badge should be blue "Professional"!

9. **Try premium features**:
   - Code Editor
   - Video Stand-ups
   - AI Code Review

---

## 🔗 Optional: Set Up Integrations

### GitHub (5 minutes)
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. New OAuth App
3. Callback URL: `http://localhost:3000/api/integrations/github/callback`
4. Copy Client ID and Secret to .env

### Slack (5 minutes)
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create New App
3. Add Redirect URL: `http://localhost:3000/api/integrations/slack/callback`
4. Copy Client ID and Secret to .env

### Others
- **Figma**: [figma.com/developers/apps](https://www.figma.com/developers/apps)
- **Notion**: [notion.so/my-integrations](https://www.notion.so/my-integrations)

---

## ✅ Verification Checklist

After setup, verify:
- [ ] Backend starts without errors
- [ ] Can access pricing page
- [ ] "Upgrade Now" redirects to Stripe
- [ ] Test payment completes successfully
- [ ] Redirected to success page
- [ ] Dashboard shows "Professional" badge
- [ ] Can access Code Editor
- [ ] Can access Video Stand-ups

---

## 🎯 What You Get

### With Payment Integration:
- ✅ Real Stripe checkout
- ✅ Automatic subscription upgrade
- ✅ Secure payment processing
- ✅ Webhook handling
- ✅ Test mode (no real money)

### With Integrations:
- ✅ GitHub repository sync
- ✅ Figma design import
- ✅ Slack notifications
- ✅ Notion documentation
- ✅ VS Code settings sync

---

## 🐛 Troubleshooting

### "Webhook signature verification failed"
- Make sure STRIPE_WEBHOOK_SECRET is correct in .env
- Restart backend after updating .env

### "No price ID found"
- Make sure STRIPE_PROFESSIONAL_PRICE_ID is set in .env
- Check that price ID starts with `price_`

### "Payment succeeded but subscription not upgraded"
- Check backend logs for webhook errors
- Webhook might take a few seconds to process
- Refresh the page

### "Integration callback failed"
- Check that callback URLs match exactly
- Make sure BACKEND_URL is set in .env
- Verify OAuth app credentials

---

## 📞 Need Help?

1. Check `PAYMENT_INTEGRATIONS_SETUP.md` for detailed setup
2. Check `PAYMENT_INTEGRATIONS_SUMMARY.md` for technical details
3. Check backend console for error messages
4. Check Stripe Dashboard → Developers → Logs

---

## 🎊 You're Ready!

Your CODEX INC platform now has:
- ✅ Real payment processing
- ✅ Automatic subscription management
- ✅ Platform integrations
- ✅ Secure OAuth flows

**Start accepting payments and connecting integrations!** 🚀

---

*Setup time: ~15 minutes*
*Last updated: January 24, 2026*
