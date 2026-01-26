# Payment & Integrations Setup Guide

## 🎉 What's New

You now have:
- ✅ **Real Stripe Payment Integration** - Secure payment processing
- ✅ **GitHub Integration** - Sync repositories
- ✅ **Figma Integration** - Import designs
- ✅ **Slack Integration** - Team notifications
- ✅ **Notion Integration** - Documentation sync
- ✅ **VS Code Integration** - Settings sync

---

## 🔐 Stripe Payment Setup

### Step 1: Create Stripe Account
1. Go to [https://stripe.com](https://stripe.com)
2. Sign up for a free account
3. Complete account verification

### Step 2: Get API Keys
1. Go to Stripe Dashboard → Developers → API keys
2. Copy your **Secret key** (starts with `sk_test_`)
3. Copy your **Publishable key** (starts with `pk_test_`)

### Step 3: Create Products & Prices
1. Go to Products → Add Product
2. Create "Professional Monthly" product
   - Name: Professional Monthly
   - Price: $25/month
   - Recurring: Monthly
   - Copy the **Price ID** (starts with `price_`)

3. Create "Professional Yearly" product
   - Name: Professional Yearly
   - Price: $250/year (save $50!)
   - Recurring: Yearly
   - Copy the **Price ID**

### Step 4: Set Up Webhook
1. Go to Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `http://localhost:3000/api/subscription/webhook/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Webhook signing secret** (starts with `whsec_`)

### Step 5: Update .env File
```env
STRIPE_SECRET_KEY=sk_test_your_actual_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret
STRIPE_PROFESSIONAL_PRICE_ID=price_your_monthly_price_id
STRIPE_PROFESSIONAL_YEARLY_PRICE_ID=price_your_yearly_price_id
```

---

## 🔗 GitHub Integration Setup

### Step 1: Create OAuth App
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - Application name: CODEX INC
   - Homepage URL: `http://localhost:5500`
   - Authorization callback URL: `http://localhost:3000/api/integrations/github/callback`
4. Click "Register application"
5. Copy **Client ID** and **Client Secret**

### Step 2: Update .env
```env
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

---

## 🎨 Figma Integration Setup

### Step 1: Create Figma App
1. Go to [https://www.figma.com/developers/apps](https://www.figma.com/developers/apps)
2. Click "Create app"
3. Fill in:
   - App name: CODEX INC
   - Callback URL: `http://localhost:3000/api/integrations/figma/callback`
4. Copy **Client ID** and **Client Secret**

### Step 2: Update .env
```env
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret
```

---

## 💬 Slack Integration Setup

### Step 1: Create Slack App
1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. App Name: CODEX INC
4. Choose your workspace
5. Go to "OAuth & Permissions"
6. Add Redirect URL: `http://localhost:3000/api/integrations/slack/callback`
7. Add Bot Token Scopes:
   - `channels:read`
   - `chat:write`
   - `users:read`
8. Copy **Client ID** and **Client Secret** from "Basic Information"

### Step 2: Update .env
```env
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
```

---

## 📝 Notion Integration Setup

### Step 1: Create Notion Integration
1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Fill in:
   - Name: CODEX INC
   - Associated workspace: Your workspace
   - Type: Public
4. Add Redirect URI: `http://localhost:3000/api/integrations/notion/callback`
5. Copy **Client ID** and **Client Secret**

### Step 2: Update .env
```env
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
```

---

## 💻 VS Code Integration

VS Code integration uses a simple access token approach:
1. User generates a token in VS Code
2. User enters token in CODEX INC
3. Settings are synced

No OAuth setup required!

---

## 🧪 Testing Payment Flow

### Test Mode (No Real Money)
Stripe provides test cards:

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Failed Payment:**
- Card: `4000 0000 0000 0002`

### Test the Flow
1. Start backend: `start-backend.bat`
2. Sign in to your account
3. Go to Pricing page
4. Click "Upgrade Now" on Professional tier
5. You'll be redirected to Stripe Checkout
6. Use test card: `4242 4242 4242 4242`
7. Complete payment
8. You'll be redirected to success page
9. Subscription will be automatically upgraded!

---

## 🔒 Security Features

### Payment Security
- ✅ Stripe handles all card data (PCI compliant)
- ✅ Webhook signature verification
- ✅ No card data stored in your database
- ✅ Secure HTTPS required in production

### Integration Security
- ✅ OAuth 2.0 for all integrations
- ✅ Access tokens encrypted in database
- ✅ Token refresh handling
- ✅ Secure callback URLs

---

## 📊 How It Works

### Payment Flow
```
User clicks "Upgrade"
    ↓
Create Stripe Checkout Session
    ↓
Redirect to Stripe (secure payment page)
    ↓
User enters card details
    ↓
Stripe processes payment
    ↓
Stripe sends webhook to your server
    ↓
Server upgrades user subscription
    ↓
User redirected to success page
    ↓
Dashboard shows new tier badge
```

### Integration Flow
```
User clicks "Connect GitHub"
    ↓
Redirect to GitHub OAuth
    ↓
User authorizes app
    ↓
GitHub redirects back with code
    ↓
Exchange code for access token
    ↓
Save token in database
    ↓
Show "Connected" status
```

---

## 🎯 Features After Payment

Once a user upgrades to Professional:
- ✅ Subscription status automatically updated
- ✅ Dashboard badge changes to blue "Professional"
- ✅ Access to Code Editor unlocked
- ✅ Access to Video Stand-ups unlocked
- ✅ Access to AI Code Review unlocked
- ✅ All premium features enabled

---

## 🔄 Subscription Management

### Customer Portal
Users can manage their subscription via Stripe Customer Portal:
- View billing history
- Update payment method
- Cancel subscription
- Download invoices

Access from Settings page → "Manage Billing"

---

## 📝 Environment Variables Checklist

Make sure your `.env` file has:
- [x] STRIPE_SECRET_KEY
- [x] STRIPE_PUBLISHABLE_KEY
- [x] STRIPE_WEBHOOK_SECRET
- [x] STRIPE_PROFESSIONAL_PRICE_ID
- [x] GITHUB_CLIENT_ID
- [x] GITHUB_CLIENT_SECRET
- [x] SLACK_CLIENT_ID
- [x] SLACK_CLIENT_SECRET
- [x] NOTION_CLIENT_ID
- [x] NOTION_CLIENT_SECRET
- [x] FIGMA_CLIENT_ID
- [x] FIGMA_CLIENT_SECRET
- [x] BACKEND_URL

---

## 🚀 Quick Start

1. **Set up Stripe** (15 minutes)
   - Create account
   - Get API keys
   - Create products
   - Set up webhook

2. **Set up Integrations** (5 minutes each)
   - GitHub OAuth app
   - Slack app
   - Notion integration
   - Figma app

3. **Update .env** (2 minutes)
   - Add all keys and secrets

4. **Restart Server** (1 minute)
   ```bash
   start-backend.bat
   ```

5. **Test Everything** (10 minutes)
   - Test payment with test card
   - Connect each integration
   - Verify features unlock

---

## 🎊 You're Done!

Your CODEX INC platform now has:
- Real payment processing
- Professional integrations
- Secure OAuth flows
- Automatic subscription management

**Total setup time: ~45 minutes**

---

## 📞 Need Help?

- **Stripe Docs**: [https://stripe.com/docs](https://stripe.com/docs)
- **GitHub OAuth**: [https://docs.github.com/en/developers/apps](https://docs.github.com/en/developers/apps)
- **Slack API**: [https://api.slack.com/docs](https://api.slack.com/docs)
- **Notion API**: [https://developers.notion.com](https://developers.notion.com)
- **Figma API**: [https://www.figma.com/developers/api](https://www.figma.com/developers/api)

---

*Last Updated: January 24, 2026*
