# OAuth Redirect URLs Update Checklist

After deploying to production, you MUST update all OAuth redirect URLs to use your production domain.

**Your Production Domain:** `https://yourdomain.com` (replace with actual domain)

---

## ✓ GitHub OAuth

1. Go to: https://github.com/settings/developers
2. Click on your OAuth App (or create new one)
3. Update these fields:
   - **Homepage URL:** `https://yourdomain.com`
   - **Authorization callback URL:** `https://yourdomain.com/api/integrations/github/callback`
4. Click "Update application"
5. Copy **Client ID** and **Client Secret** to your `.env` file

**Environment Variables:**
```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

---

## ✓ Discord OAuth

1. Go to: https://discord.com/developers/applications
2. Select your application (or create new one)
3. Go to **OAuth2** section
4. Under **Redirects**, add:
   - `https://yourdomain.com/api/integrations/discord/callback`
5. Click "Save Changes"
6. Copy **Client ID** and **Client Secret**

**Environment Variables:**
```env
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```

**Note:** Discord tokens expire after 7 days. Users will need to reconnect periodically.

---

## ✓ Slack OAuth

1. Go to: https://api.slack.com/apps
2. Select your app (or create new one)
3. Go to **OAuth & Permissions**
4. Under **Redirect URLs**, add:
   - `https://yourdomain.com/api/integrations/slack/callback`
5. Click "Save URLs"
6. Copy **Client ID** and **Client Secret** from **Basic Information**

**Environment Variables:**
```env
SLACK_CLIENT_ID=your_client_id_here
SLACK_CLIENT_SECRET=your_client_secret_here
```

**Required Scopes:**
- `channels:read`
- `chat:write`
- `users:read`
- `team:read`

---

## ✓ Notion OAuth

1. Go to: https://www.notion.so/my-integrations
2. Click on your integration (or create new one)
3. Under **OAuth Domain & URIs**, add:
   - **Redirect URI:** `https://yourdomain.com/api/integrations/notion/callback`
4. Click "Save changes"
5. Copy **OAuth client ID** and **OAuth client secret**

**Environment Variables:**
```env
NOTION_CLIENT_ID=your_client_id_here
NOTION_CLIENT_SECRET=your_client_secret_here
```

**Capabilities Required:**
- Read content
- Update content
- Insert content

---

## ✓ Figma OAuth

1. Go to: https://www.figma.com/developers/apps
2. Select your app (or create new one)
3. Under **OAuth2**, add:
   - **Callback URL:** `https://yourdomain.com/api/integrations/figma/callback`
4. Click "Save"
5. Copy **Client ID** and **Client Secret**

**Environment Variables:**
```env
FIGMA_CLIENT_ID=your_client_id_here
FIGMA_CLIENT_SECRET=your_client_secret_here
```

**Scopes:**
- `file_read`

---

## ✓ Stripe Webhooks

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter endpoint URL:
   - `https://yourdomain.com/api/subscription/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy **Signing secret**

**Environment Variables:**
```env
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

**Important:** Switch from test mode to live mode in Stripe dashboard!

---

## ✓ VS Code Extension (Optional)

If you plan to create a VS Code extension:

1. Go to: https://marketplace.visualstudio.com/manage
2. Create new publisher
3. Configure extension to connect to: `https://yourdomain.com/api/vscode`

---

## Testing OAuth Flows

After updating all URLs, test each integration:

### Test Script (Browser Console)

```javascript
// Test GitHub
fetch('https://yourdomain.com/api/integrations/github/auth', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
})
.then(r => r.json())
.then(data => console.log('GitHub Auth URL:', data.authUrl));

// Test Discord
fetch('https://yourdomain.com/api/integrations/discord/auth', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
})
.then(r => r.json())
.then(data => console.log('Discord Auth URL:', data.authUrl));

// Repeat for other integrations...
```

### Manual Testing

1. Go to `https://yourdomain.com/settings.html`
2. Click "Connect" for each integration
3. Verify redirect to OAuth provider
4. Authorize the app
5. Verify redirect back to your site
6. Check integration shows as "Connected"

---

## Common Issues

### Issue: "Redirect URI mismatch"
**Cause:** OAuth app has wrong callback URL
**Fix:** Double-check the exact URL in OAuth app settings

### Issue: "Invalid client"
**Cause:** Wrong Client ID or Client Secret
**Fix:** Copy credentials again from OAuth provider

### Issue: "CORS error"
**Cause:** Backend not allowing frontend domain
**Fix:** Update CORS settings in `server.js`:
```javascript
app.use(cors({
    origin: 'https://yourdomain.com',
    credentials: true
}));
```

### Issue: "Token expired" (Discord)
**Cause:** Discord tokens expire after 7 days
**Fix:** Users must reconnect in Settings page

---

## Environment Variables Checklist

Make sure your `.env` file has ALL of these:

```env
# MongoDB
✓ MONGODB_URI=mongodb+srv://...

# JWT
✓ JWT_SECRET=random_secret_key

# URLs
✓ FRONTEND_URL=https://yourdomain.com
✓ BACKEND_URL=https://yourdomain.com

# GitHub
✓ GITHUB_CLIENT_ID=...
✓ GITHUB_CLIENT_SECRET=...

# Discord
✓ DISCORD_CLIENT_ID=...
✓ DISCORD_CLIENT_SECRET=...

# Slack
✓ SLACK_CLIENT_ID=...
✓ SLACK_CLIENT_SECRET=...

# Notion
✓ NOTION_CLIENT_ID=...
✓ NOTION_CLIENT_SECRET=...

# Figma
✓ FIGMA_CLIENT_ID=...
✓ FIGMA_CLIENT_SECRET=...

# Stripe
✓ STRIPE_SECRET_KEY=sk_live_...
✓ STRIPE_PUBLISHABLE_KEY=pk_live_...

# Groq AI
✓ GROQ_API_KEY=...

# Email
✓ SMTP_HOST=smtp.gmail.com
✓ SMTP_PORT=587
✓ SMTP_USER=...
✓ SMTP_PASS=...

# Server
✓ PORT=3000
✓ NODE_ENV=production
```

---

## Quick Reference: All Callback URLs

Replace `yourdomain.com` with your actual domain:

- **GitHub:** `https://yourdomain.com/api/integrations/github/callback`
- **Discord:** `https://yourdomain.com/api/integrations/discord/callback`
- **Slack:** `https://yourdomain.com/api/integrations/slack/callback`
- **Notion:** `https://yourdomain.com/api/integrations/notion/callback`
- **Figma:** `https://yourdomain.com/api/integrations/figma/callback`
- **Stripe:** `https://yourdomain.com/payment-success.html`

---

## Need Help?

If you encounter issues:

1. Check browser console for errors
2. Check server logs: `pm2 logs codex`
3. Verify all environment variables are set
4. Test OAuth URLs manually
5. Check OAuth provider documentation

**Still stuck?** Contact the OAuth provider's support or check their documentation.
