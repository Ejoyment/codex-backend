# CODEX INC - Production Deployment Quick Start
## Domain: codexincenterprise.online

---

## 🚀 Quick Deploy (5 Steps)

### 1. Run Deployment Script
```batch
DEPLOY_NOW.bat
```
This will:
- Update all API URLs to your domain
- Create deployment package
- Generate .env template
- Create .htaccess file

### 2. Configure Environment
Open `deployment\.env` and fill in:
- MongoDB Atlas connection string
- All OAuth credentials (GitHub, Discord, Slack, Notion, Figma)
- Stripe keys
- Groq API key
- Email credentials

### 3. Upload to Spaceship
Use FTP client (FileZilla):
- Host: `ftp.codexincenterprise.online`
- Upload `deployment\*` to `/public_html/`

### 4. SSH & Install
```bash
ssh username@codexincenterprise.online
cd /public_html
npm install --production
pm2 start server.js --name codex
pm2 startup
pm2 save
```

### 5. Update OAuth URLs
Update callback URLs in all OAuth providers to:
```
https://codexincenterprise.online/api/integrations/[provider]/callback
```

---

## 📋 OAuth Callback URLs

Copy these exact URLs to each provider:

### GitHub
- **Homepage:** `https://codexincenterprise.online`
- **Callback:** `https://codexincenterprise.online/api/integrations/github/callback`
- **Update at:** https://github.com/settings/developers

### Discord
- **Callback:** `https://codexincenterprise.online/api/integrations/discord/callback`
- **Update at:** https://discord.com/developers/applications

### Slack
- **Callback:** `https://codexincenterprise.online/api/integrations/slack/callback`
- **Update at:** https://api.slack.com/apps

### Notion
- **Callback:** `https://codexincenterprise.online/api/integrations/notion/callback`
- **Update at:** https://www.notion.so/my-integrations

### Figma
- **Callback:** `https://codexincenterprise.online/api/integrations/figma/callback`
- **Update at:** https://www.figma.com/developers/apps

### Stripe
- **Success URL:** `https://codexincenterprise.online/payment-success.html`
- **Webhook:** `https://codexincenterprise.online/api/subscription/webhook`
- **Update at:** https://dashboard.stripe.com/webhooks

---

## 🗄️ MongoDB Atlas Setup (Free)

1. Go to https://www.mongodb.com/cloud/atlas
2. Create account → Create free M0 cluster
3. Database Access → Add User:
   - Username: `codex_admin`
   - Password: (generate strong password)
4. Network Access → Add IP: `0.0.0.0/0`
5. Connect → Get connection string
6. Replace `<password>` with your password
7. Add to `.env` as `MONGODB_URI`

**Example connection string:**
```
mongodb+srv://codex_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/codex?retryWrites=true&w=majority
```

---

## 🔐 Environment Variables Template

```env
# MongoDB
MONGODB_URI=mongodb+srv://codex_admin:password@cluster0.xxxxx.mongodb.net/codex

# JWT
JWT_SECRET=your_random_secret_key_here

# URLs
FRONTEND_URL=https://codexincenterprise.online
BACKEND_URL=https://codexincenterprise.online

# GitHub
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=abc123...

# Discord
DISCORD_CLIENT_ID=123456789...
DISCORD_CLIENT_SECRET=xyz789...

# Slack
SLACK_CLIENT_ID=123456789.123456789
SLACK_CLIENT_SECRET=abc123...

# Notion
NOTION_CLIENT_ID=abc-123-def
NOTION_CLIENT_SECRET=secret_xyz...

# Figma
FIGMA_CLIENT_ID=abc123def456
FIGMA_CLIENT_SECRET=figs_xyz...

# Stripe (LIVE keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Groq AI
GROQ_API_KEY=gsk_...

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Server
PORT=3000
NODE_ENV=production
```

---

## 🔧 Spaceship Hosting Setup

### FTP Access
1. Login to Spaceship dashboard
2. Go to Hosting → Your domain
3. Find FTP credentials:
   - Host: `ftp.codexincenterprise.online`
   - Username: (shown in dashboard)
   - Password: (shown in dashboard)

### SSH Access (if available)
```bash
ssh username@codexincenterprise.online
```

### File Structure
```
/public_html/
├── index.html
├── dashboard.html
├── settings.html
├── js/
├── css/
├── routes/
├── models/
├── server.js
├── package.json
├── .env
└── .htaccess
```

---

## ✅ Testing Checklist

After deployment, test these:

- [ ] Visit https://codexincenterprise.online
- [ ] Sign up for new account
- [ ] Verify email works
- [ ] Login to dashboard
- [ ] Connect GitHub integration
- [ ] Connect Discord integration
- [ ] View repositories on dashboard
- [ ] View Discord servers
- [ ] Create a team/workspace
- [ ] Test AI Pair programming
- [ ] Try upgrading to Professional tier
- [ ] Test payment with Stripe test card: `4242 4242 4242 4242`

---

## 🐛 Common Issues & Fixes

### Issue: Site not loading
```bash
# Check if server is running
pm2 status

# View logs
pm2 logs codex

# Restart server
pm2 restart codex
```

### Issue: "Cannot connect to MongoDB"
- Check `.env` has correct `MONGODB_URI`
- Verify MongoDB Atlas IP whitelist: `0.0.0.0/0`
- Test connection: `node test-mongodb.js`

### Issue: "OAuth redirect mismatch"
- Verify callback URLs match exactly
- Clear browser cache
- Check OAuth app settings

### Issue: "API calls fail"
- Check `.htaccess` is uploaded
- Verify Node.js server is running
- Check CORS settings in `server.js`

### Issue: SSL not working
- Wait 10-15 minutes after enabling
- Clear browser cache
- Check Spaceship SSL status

---

## 📊 Monitoring

### Check Server Status
```bash
pm2 status
pm2 logs codex --lines 50
```

### View Error Logs
```bash
tail -f /var/log/nginx/error.log
pm2 logs codex --err
```

### Restart Server
```bash
pm2 restart codex
```

### Update Code
```bash
cd /public_html
# Upload new files via FTP
npm install --production
pm2 restart codex
```

---

## 🎯 Production URLs

- **Main Site:** https://codexincenterprise.online
- **Dashboard:** https://codexincenterprise.online/dashboard.html
- **Settings:** https://codexincenterprise.online/settings.html
- **API Base:** https://codexincenterprise.online/api
- **Sign Up:** https://codexincenterprise.online/signup.html
- **Sign In:** https://codexincenterprise.online/sign_in.html

---

## 📞 Support

**Spaceship Support:**
- Dashboard: https://www.spaceship.com/dashboard
- Email: support@spaceship.com
- Live Chat: Available in dashboard

**Need Help?**
- Check `DEPLOY_TO_SPACESHIP.md` for detailed guide
- See `OAUTH_UPDATE_CHECKLIST.md` for OAuth setup
- Review `TROUBLESHOOTING.md` for common issues

---

## 🎉 You're Ready!

Run `DEPLOY_NOW.bat` to start the deployment process.

Good luck with your launch! 🚀
