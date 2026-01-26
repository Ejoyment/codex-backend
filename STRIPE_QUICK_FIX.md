# 🚨 Stripe Webhook Fix - Localhost Issue

## The Problem
Stripe said: "Endpoint URL needs to be a public URL"
**Why?** Because `localhost:3000` is only on your computer, Stripe can't reach it.

---

## ✅ The Solution: Stripe CLI

Stripe CLI creates a tunnel from Stripe → Your Localhost

---

## 🎯 Quick Fix (5 Minutes)

### Step 1: Install Stripe CLI

**Download:**
https://github.com/stripe/stripe-cli/releases/latest

**Get:** `stripe_X.X.X_windows_x86_64.zip`

**Extract** to any folder (e.g., `C:\stripe`)

---

### Step 2: Login to Stripe

Open **Command Prompt** or **PowerShell** and run:

```bash
cd C:\stripe  # or wherever you extracted it
stripe login
```

This opens your browser → Click "Allow access"

---

### Step 3: Forward Webhooks

In the same terminal, run:

```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

You'll see:
```
> Ready! Your webhook signing secret is whsec_1234567890abcdef...
```

**COPY THAT SECRET!** (the part after `whsec_`)

---

### Step 4: Update .env

Open your `.env` file and update this line:

```env
STRIPE_WEBHOOK_SECRET=whsec_paste_the_secret_you_just_copied
```

**Save the file!**

---

### Step 5: Run Everything

You need **TWO terminals**:

**Terminal 1 - Backend:**
```bash
start-backend.bat
```

**Terminal 2 - Stripe CLI:**
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe
```

**OR use the helper script:**
```bash
start-with-stripe.bat
```
(This opens both terminals automatically!)

---

### Step 6: Test Payment

1. Go to your app
2. Sign in
3. Go to Pricing page
4. Click "Upgrade Now"
5. Use test card: `4242 4242 4242 4242`
6. Complete payment
7. **Watch Terminal 2** - you'll see the webhook arrive!
8. Check dashboard - badge should be blue!

---

## 🎯 What's Happening?

```
Your Browser
    ↓ (payment)
Stripe Checkout
    ↓ (webhook)
Stripe CLI (Terminal 2)
    ↓ (forward)
Your Backend (Terminal 1)
    ↓ (upgrade)
Database Updated!
```

---

## 📋 Checklist

- [ ] Downloaded Stripe CLI
- [ ] Ran `stripe login`
- [ ] Ran `stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe`
- [ ] Copied webhook secret (whsec_...)
- [ ] Updated .env file
- [ ] Restarted backend
- [ ] Both terminals running
- [ ] Tested payment with 4242 card
- [ ] Saw webhook in Stripe CLI terminal
- [ ] Dashboard shows blue badge

---

## 🐛 Troubleshooting

### "stripe: command not found"
**Fix:** 
- Make sure you're in the folder where you extracted Stripe CLI
- Or add it to your PATH

### "Connection refused"
**Fix:**
- Make sure backend is running first
- Check it's on port 3000

### "Webhook signature verification failed"
**Fix:**
- Make sure you copied the FULL secret (including `whsec_`)
- Restart backend after updating .env
- Make sure no extra spaces in .env

### Webhook not arriving
**Fix:**
- Make sure Stripe CLI terminal is still running
- Check the CLI terminal for errors
- Make sure the URL is exactly: `localhost:3000/api/subscription/webhook/stripe`

---

## 💡 Pro Tips

1. **Keep Stripe CLI running** - Don't close that terminal!
2. **Watch the output** - You'll see every webhook in real-time
3. **Test different cards** - Try failed payment: `4000 0000 0000 0002`
4. **Check Stripe Dashboard** - Go to Developers → Events to see all events

---

## 🎊 Alternative: Skip Webhooks for Now

If Stripe CLI is too complicated, you can test without webhooks:

1. Complete payment on Stripe
2. Open browser console (F12)
3. Run this:
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'professional', paymentProvider: 'stripe' })
}).then(r => r.json()).then(console.log);
```
4. Refresh page - badge should be blue!

---

## 🚀 For Production

When you deploy to a real server:
- Use the server's public URL for webhooks
- No Stripe CLI needed
- Webhooks work automatically

---

**Need more help?** Check `STRIPE_LOCALHOST_SETUP.md` for detailed alternatives!

*Last updated: January 24, 2026*
