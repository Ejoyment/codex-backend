# 🎯 Connect Stripe RIGHT NOW - Simple Steps

## ⏱️ Total Time: 10 Minutes

---

## ✅ Step 1: Sign Up (2 min)

1. Go to: **https://stripe.com**
2. Click **"Sign up"**
3. Enter email and password
4. ✅ Done! You're in **Test Mode** (see toggle in top right)

---

## ✅ Step 2: Get API Keys (1 min)

1. Click **"Developers"** (left sidebar)
2. Click **"API keys"**
3. Copy these TWO keys:

```
Secret key (click "Reveal"):
sk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Publishable key:
pk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ✅ Step 3: Create Product (2 min)

1. Click **"Products"** (left sidebar)
2. Click **"Add product"**
3. Fill in:
   - Name: `Professional Monthly`
   - Price: `25` USD
   - Billing: `Monthly` ✓ Recurring

4. Click **"Save product"**
5. Copy the **Price ID**:
```
price_1xxxxxxxxxxxxxxxxxxxxx
```

---

## ✅ Step 4: Setup Webhook with Stripe CLI (5 min)

**Important:** Stripe needs a public URL, but localhost isn't public!
**Solution:** Use Stripe CLI to forward webhooks.

### Install Stripe CLI:
1. Download from: https://github.com/stripe/stripe-cli/releases/latest
2. Download `stripe_X.X.X_windows_x86_64.zip`
3. Extract to a folder

### Login and Forward:
```bash
# Login to Stripe
stripe login

# Forward webhooks to localhost (keep this running!)
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

You'll see:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

**Copy that webhook secret!**

**Keep this terminal running while testing!**

> **Alternative:** See `STRIPE_LOCALHOST_SETUP.md` for other options (ngrok, manual testing)

---

## ✅ Step 5: Update .env File (2 min)

Open your `.env` file and replace these lines:

```env
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
STRIPE_PROFESSIONAL_PRICE_ID=price_YOUR_PRICE_ID_HERE
```

**With your actual keys** (paste what you copied above)

**Save the file!**

---

## ✅ Step 6: Start Everything (2 min)

**You need TWO terminals running:**

**Terminal 1 - Backend:**
```bash
start-backend.bat
```

**Terminal 2 - Stripe CLI:**
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

Both should be running:
```
Terminal 1: ✓ MongoDB connected, 🚀 Server running
Terminal 2: > Ready! Listening for webhooks...
```

---

## ✅ Step 7: TEST IT! (2 min)

1. Open your app in browser
2. Sign in
3. Go to **Pricing** page
4. Click **"Upgrade Now"**
5. Use test card:
   ```
   Card: 4242 4242 4242 4242
   Expiry: 12/25
   CVC: 123
   ZIP: 12345
   ```
6. Click **"Pay"**
7. ✅ Success! Check your dashboard - badge should be BLUE!

---

## 🎉 YOU'RE DONE!

Your Stripe is connected! Now you can:
- Accept payments (test mode)
- Automatically upgrade users
- Process subscriptions

---

## 📋 Quick Checklist

- [ ] Created Stripe account
- [ ] Got Secret Key (sk_test_...)
- [ ] Got Publishable Key (pk_test_...)
- [ ] Created product ($25/month)
- [ ] Got Price ID (price_...)
- [ ] Created webhook endpoint
- [ ] Got Webhook Secret (whsec_...)
- [ ] Updated .env file with all keys
- [ ] Restarted backend
- [ ] Tested payment with 4242 card
- [ ] Saw "Professional" badge in dashboard

---

## 🆘 Need Help?

**Can't find something?**
- Make sure you're in **Test Mode** (toggle in top right of Stripe)
- Check `STRIPE_SETUP_GUIDE.md` for detailed screenshots

**Backend errors?**
- Check backend console for error messages
- Make sure all keys are copied correctly (no extra spaces)

**Payment not working?**
- Check that webhook URL is exactly: `http://localhost:3000/api/subscription/webhook/stripe`
- Make sure backend is running
- Check Stripe Dashboard → Webhooks → Your webhook → "Attempts" for errors

---

## 🚀 What's Next?

After Stripe works:
1. Test canceling subscription
2. Try the Customer Portal
3. Set up integrations (GitHub, Slack, etc.)
4. When ready for production, switch to Live Mode in Stripe

---

**You got this! 💪**

*Any issues? Check the backend console - it shows detailed error messages!*
