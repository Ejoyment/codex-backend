# 🚀 How to Connect Stripe - Step by Step

## Step 1: Create Stripe Account (2 minutes)

1. Go to **https://stripe.com**
2. Click **"Start now"** or **"Sign up"**
3. Enter your email and create a password
4. You'll be in **Test Mode** automatically (perfect for development!)

---

## Step 2: Get Your API Keys (1 minute)

1. In Stripe Dashboard, click **"Developers"** in the left sidebar
2. Click **"API keys"**
3. You'll see two keys:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`) - Click "Reveal test key"

4. **Copy both keys** - you'll need them in a moment!

---

## Step 3: Create Your Product (3 minutes)

1. In Stripe Dashboard, click **"Products"** in the left sidebar
2. Click **"Add product"**
3. Fill in:
   - **Name**: `Professional Monthly`
   - **Description**: `CODEX INC Professional Subscription`
   - **Pricing model**: Select **"Standard pricing"**
   - **Price**: `25` USD
   - **Billing period**: Select **"Monthly"**
   - **Recurring**: Make sure it's checked ✓

4. Click **"Save product"**

5. **Copy the Price ID**:
   - You'll see it under the price (starts with `price_`)
   - It looks like: `price_1AbCdEfGhIjKlMnO`

---

## Step 4: Set Up Webhook (3 minutes)

1. In Stripe Dashboard, click **"Developers"** → **"Webhooks"**
2. Click **"Add endpoint"**
3. Fill in:
   - **Endpoint URL**: `http://localhost:3000/api/subscription/webhook/stripe`
   - **Description**: `CODEX INC Subscription Webhooks`

4. Click **"Select events"**
5. Search and select these events:
   - ✓ `checkout.session.completed`
   - ✓ `customer.subscription.updated`
   - ✓ `customer.subscription.deleted`
   - ✓ `invoice.payment_succeeded`
   - ✓ `invoice.payment_failed`

6. Click **"Add events"** then **"Add endpoint"**

7. **Copy the Signing secret**:
   - Click on your new webhook
   - Click **"Reveal"** next to "Signing secret"
   - Copy it (starts with `whsec_`)

---

## Step 5: Update Your .env File (2 minutes)

1. Open your `.env` file in the project root
2. Add these lines (replace with your actual keys):

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
STRIPE_PROFESSIONAL_PRICE_ID=price_YOUR_PRICE_ID_HERE

# Backend URL (keep this as is)
BACKEND_URL=http://localhost:3000
```

**Example (with fake keys):**
```env
STRIPE_SECRET_KEY=sk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuvwxyz
STRIPE_PROFESSIONAL_PRICE_ID=price_1AbCdEfGhIjKlMnO
BACKEND_URL=http://localhost:3000
```

3. **Save the file**

---

## Step 6: Restart Your Backend (1 minute)

**You need TWO terminals running:**

**Terminal 1 - Your Backend:**
```bash
start-backend.bat
```

**Terminal 2 - Stripe CLI (for webhooks):**
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

You should see:
```
Terminal 1: ✓ MongoDB connected, 🚀 Server running on port 3000
Terminal 2: > Ready! Listening for webhook events...
```

**Keep both terminals running!**

---

## Step 7: Test Your Payment! (2 minutes)

1. Open your browser and go to your app
2. Sign in to your account
3. Go to **Pricing** page
4. Click **"Upgrade Now"** on Professional tier
5. You'll be redirected to Stripe Checkout

6. **Use this test card** (no real money!):
   - Card number: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/25`)
   - CVC: Any 3 digits (e.g., `123`)
   - Name: Your name
   - ZIP: Any 5 digits (e.g., `12345`)

7. Click **"Pay"**

8. You'll be redirected to success page!

9. Go to **Dashboard** - your badge should now be **blue** and say **"Professional"**! 🎉

10. Try accessing **Code Editor** or **Video Stand-ups** - they should work now!

---

## ✅ Verification Checklist

After setup, check:
- [ ] Backend starts without errors
- [ ] Can click "Upgrade Now" on pricing page
- [ ] Redirected to Stripe checkout page
- [ ] Can complete payment with test card
- [ ] Redirected to success page
- [ ] Dashboard shows "Professional" badge (blue)
- [ ] Can access Code Editor
- [ ] Can access Video Stand-ups

---

## 🎯 What Each Key Does

| Key | Purpose | Where It's Used |
|-----|---------|----------------|
| **Secret Key** | Server-side operations | Backend creates checkout sessions |
| **Publishable Key** | Client-side (not used yet) | Future: Direct Stripe.js integration |
| **Webhook Secret** | Verify webhooks | Backend verifies Stripe sent the webhook |
| **Price ID** | Identifies your product | Backend creates checkout for this price |

---

## 🐛 Troubleshooting

### "Webhook signature verification failed"
- **Fix**: Make sure you copied the webhook secret correctly
- Restart backend after updating .env

### "No price found"
- **Fix**: Make sure STRIPE_PROFESSIONAL_PRICE_ID is set
- Check that it starts with `price_`

### "Payment succeeded but not upgraded"
- **Fix**: Check backend console for webhook errors
- Webhook might take 2-3 seconds to process
- Refresh the page

### Can't find API keys
- **Fix**: Make sure you're in "Developers" → "API keys"
- Make sure you're in **Test mode** (toggle in top right)

---

## 🎊 You're Done!

Your Stripe is now connected! You can:
- ✅ Accept test payments
- ✅ Automatically upgrade users
- ✅ Process webhooks
- ✅ Manage subscriptions

**Total setup time: ~15 minutes**

---

## 📝 Quick Reference

**Stripe Dashboard**: https://dashboard.stripe.com
**Test Cards**: https://stripe.com/docs/testing
**Webhook Testing**: Use Stripe CLI or test in browser

---

## 🚀 Next Steps

1. **Test the full flow** with the test card
2. **Check Stripe Dashboard** → Payments to see test payment
3. **Check Stripe Dashboard** → Customers to see test customer
4. **Try canceling** subscription from settings (coming soon)

---

## 💡 Pro Tips

- Keep test mode ON during development
- Test cards never charge real money
- You can see all test payments in Stripe Dashboard
- Webhooks are instant in test mode
- You can replay webhooks from Stripe Dashboard

---

**Need help?** Check the backend console for detailed error messages!

*Last updated: January 24, 2026*
