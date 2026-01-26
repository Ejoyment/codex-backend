# 🔧 Stripe Webhook Setup for Localhost

## The Problem
Stripe webhooks need a **public URL**, but your backend runs on `localhost:3000` which Stripe can't reach.

## ✅ Solution: Use Stripe CLI (Recommended)

The Stripe CLI forwards webhooks from Stripe to your localhost automatically!

---

## Option 1: Stripe CLI (Best for Development)

### Step 1: Install Stripe CLI

**Windows:**
1. Download from: https://github.com/stripe/stripe-cli/releases/latest
2. Download `stripe_X.X.X_windows_x86_64.zip`
3. Extract to a folder (e.g., `C:\stripe`)
4. Add to PATH or run from that folder

**Or use Chocolatey:**
```bash
choco install stripe-cli
```

**Or use Scoop:**
```bash
scoop install stripe
```

### Step 2: Login to Stripe CLI

Open a **new terminal** and run:
```bash
stripe login
```

This will:
1. Open your browser
2. Ask you to allow access
3. Connect CLI to your Stripe account

### Step 3: Forward Webhooks to Localhost

In the terminal, run:
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

You'll see:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

**Copy that webhook secret!** (starts with `whsec_`)

### Step 4: Update .env File

Open your `.env` file and update:
```env
STRIPE_WEBHOOK_SECRET=whsec_the_secret_from_stripe_cli
```

### Step 5: Keep It Running

**Important:** Keep this terminal window open while testing!
- The CLI forwards webhooks from Stripe to your localhost
- You'll see webhook events in real-time
- Stop it with Ctrl+C when done

### Step 6: Test Payment

Now test your payment flow:
1. Start backend: `start-backend.bat`
2. Go to pricing page
3. Click "Upgrade Now"
4. Use test card: `4242 4242 4242 4242`
5. Complete payment
6. Watch the Stripe CLI terminal - you'll see the webhook!
7. Check dashboard - badge should be blue!

---

## Option 2: ngrok (Alternative)

If Stripe CLI doesn't work, use ngrok to create a public URL:

### Step 1: Install ngrok

1. Go to: https://ngrok.com/download
2. Download for Windows
3. Extract and run

### Step 2: Create Tunnel

```bash
ngrok http 3000
```

You'll see:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Copy that HTTPS URL!**

### Step 3: Create Webhook in Stripe Dashboard

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://abc123.ngrok.io/api/subscription/webhook/stripe`
4. Select events:
   - checkout.session.completed
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_succeeded
   - invoice.payment_failed
5. Copy the webhook signing secret

### Step 4: Update .env

```env
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_from_dashboard
```

### Step 5: Keep ngrok Running

Keep the ngrok terminal open while testing!

---

## Option 3: Test Without Webhooks (Quick Test)

For quick testing, you can manually upgrade after payment:

### Step 1: Skip Webhook Setup

Just leave webhook secret empty or use a dummy value:
```env
STRIPE_WEBHOOK_SECRET=whsec_dummy_for_testing
```

### Step 2: Test Payment

1. Complete payment on Stripe checkout
2. You'll be redirected to success page
3. Webhook won't work, but you can manually upgrade

### Step 3: Manual Upgrade (Browser Console)

After payment, open browser console (F12) and run:
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'professional',
    paymentProvider: 'stripe'
  })
}).then(r => r.json()).then(console.log);
```

Then refresh the page - badge should be blue!

---

## 🎯 Recommended Approach

**For Development:**
1. ✅ Use **Stripe CLI** (easiest, most reliable)
2. Keep CLI terminal running while testing
3. See webhooks in real-time

**For Production:**
1. Deploy your backend to a server (Heroku, Railway, etc.)
2. Use the public URL for webhooks
3. No CLI needed

---

## 📋 Quick Setup with Stripe CLI

```bash
# 1. Install Stripe CLI
# Download from: https://github.com/stripe/stripe-cli/releases

# 2. Login
stripe login

# 3. Forward webhooks (keep this running!)
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe

# 4. Copy the webhook secret it shows
# 5. Update .env with that secret
# 6. Restart backend
# 7. Test payment!
```

---

## 🐛 Troubleshooting

### "stripe: command not found"
- Make sure Stripe CLI is installed
- Add to PATH or run from installation folder

### "Connection refused"
- Make sure backend is running on port 3000
- Check `start-backend.bat` is running

### "Webhook signature verification failed"
- Make sure you copied the webhook secret from CLI
- Restart backend after updating .env

### Webhooks not arriving
- Make sure Stripe CLI is running
- Check CLI terminal for errors
- Make sure endpoint URL is correct

---

## 💡 Pro Tips

1. **Keep CLI running** in a separate terminal
2. **Watch the CLI output** - you'll see all webhook events
3. **Test different scenarios** - successful payment, failed payment, etc.
4. **Use test mode** - no real money involved
5. **Check Stripe Dashboard** → Developers → Events to see all events

---

## 🎊 Summary

**Best Setup for Development:**
```
Terminal 1: start-backend.bat (your backend)
Terminal 2: stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
Browser: Test payment flow
```

**What happens:**
1. User pays on Stripe
2. Stripe sends webhook to Stripe CLI
3. CLI forwards to your localhost
4. Your backend processes webhook
5. User subscription upgraded automatically!

---

## 📞 Need Help?

- **Stripe CLI Docs**: https://stripe.com/docs/stripe-cli
- **ngrok Docs**: https://ngrok.com/docs
- **Webhook Testing**: https://stripe.com/docs/webhooks/test

---

*Last updated: January 24, 2026*
